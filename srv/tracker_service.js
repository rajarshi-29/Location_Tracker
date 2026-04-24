const cds = require("@sap/cds");
const { SELECT, INSERT, UPDATE } = cds.ql;
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

module.exports = cds.service.impl(function () {
  const { Trips, LocationPoints, MetricSnapshots } = this.entities;
  const operationMetrics = {
    startTrip: createMetricBucket(),
    stopTrip: createMetricBucket(),
    recordLocation: createMetricBucket()
  };
  let lastSnapshotAt = null;

  const withOperationMetrics = async (operationName, fn) => {
    const bucket = operationMetrics[operationName];
    const startedAt = Date.now();

    bucket.attempts += 1;

    try {
      const result = await fn();
      bucket.success += 1;
      return result;
    } catch (error) {
      bucket.failure += 1;
      throw error;
    } finally {
      bucket.totalLatencyMs += Date.now() - startedAt;
    }
  };

  this.on("startTrip", async (req) => {
    return withOperationMetrics("startTrip", async () => {
      const { title } = req.data;

      const activeTrip = await SELECT.one.from(Trips).where({ status: "ACTIVE" });
      if (activeTrip) {
        return activeTrip;
      }

      const now = new Date().toISOString();
      const ID = cds.utils.uuid();
      const entry = {
        ID,
        title: title || `Trip ${now}`,
        startedAt: now,
        status: "ACTIVE"
      };

      await INSERT.into(Trips).entries(entry);

      return SELECT.one.from(Trips).where({ ID });
    });
  });

  this.on("stopTrip", async (req) => {
    return withOperationMetrics("stopTrip", async () => {
      const { tripId } = req.data;
      if (!tripId) {
        return req.reject(400, "tripId is required");
      }

      const trip = await SELECT.one.from(Trips).where({ ID: tripId });
      if (!trip) {
        return req.reject(404, "Trip not found");
      }

      const endedAt = new Date().toISOString();
      await UPDATE(Trips).set({ status: "COMPLETED", endedAt }).where({ ID: tripId });

      const stoppedTrip = await SELECT.one.from(Trips).where({ ID: tripId });
      await captureSnapshotIfDue(true);
      return stoppedTrip;
    });
  });

  this.on("recordLocation", async (req) => {
    return withOperationMetrics("recordLocation", async () => {
      const { tripId, latitude, longitude } = req.data;
      if (!tripId) {
        return req.reject(400, "tripId is required");
      }
      if (latitude === undefined || longitude === undefined) {
        return req.reject(400, "latitude and longitude are required");
      }

      const trip = await SELECT.one.from(Trips).where({ ID: tripId });
      if (!trip) {
        return req.reject(404, "Trip not found");
      }

      if (trip.status !== "ACTIVE") {
        return req.reject(400, "Trip is not active");
      }

      const payload = {
        trip_ID: tripId,
        latitude,
        longitude,
        accuracy: req.data.accuracy ?? null,
        altitude: req.data.altitude ?? null,
        speed: req.data.speed ?? null,
        heading: req.data.heading ?? null,
        recordedAt: req.data.recordedAt || new Date().toISOString(),
        source: req.data.source || "browser-geolocation"
      };

      await INSERT.into(LocationPoints).entries(payload);

      return SELECT.one.from(LocationPoints).where({ trip_ID: tripId, recordedAt: payload.recordedAt });
    });
  });

  this.on("activeTrip", async () => {
    const trips = await SELECT.from(Trips).where({ status: "ACTIVE" }).orderBy("startedAt desc").limit(1);
    return trips[0] || null;
  });

  this.on("metrics", async () => {
    await captureSnapshotIfDue(false);
    return readCurrentMetrics();
  });

  const captureSnapshotIfDue = async (forceSnapshot) => {
    const now = Date.now();
    const shouldCapture = forceSnapshot || !lastSnapshotAt || now - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS;

    if (!shouldCapture) {
      return null;
    }

    const metrics = await readCurrentMetrics();
    const snapshotEntry = {
      capturedAt: metrics.generatedAt,
      totalTrips: metrics.totalTrips,
      completedTrips: metrics.completedTrips,
      completionRate: metrics.completionRate,
      totalPoints: metrics.totalPoints,
      avgPointsPerTrip: metrics.avgPointsPerTrip,
      avgGpsAccuracy: metrics.avgGpsAccuracy,
      avgSessionDurationMs: metrics.avgSessionDurationMs,
      ingestSuccessRate: metrics.ingestSuccessRate,
      avgIngestLatencyMs: metrics.avgIngestLatencyMs
    };

    await INSERT.into(MetricSnapshots).entries(snapshotEntry);
    lastSnapshotAt = now;
    return snapshotEntry;
  };

  const readCurrentMetrics = async () => {
    const [tripCountRow] = await SELECT.from(Trips).columns("count(1) as count");
    const [completedTripCountRow] = await SELECT.from(Trips).where({ status: "COMPLETED" }).columns("count(1) as count");
    const [pointCountRow] = await SELECT.from(LocationPoints).columns("count(1) as count");
    const [accuracyAverageRow] = await SELECT.from(LocationPoints)
      .where({ accuracy: { "!=": null } })
      .columns("avg(accuracy) as avgAccuracy");

    const completedTrips = await SELECT.from(Trips)
      .where({ status: "COMPLETED" })
      .columns("startedAt", "endedAt");

    const totalTrips = Number(tripCountRow?.count || 0);
    const totalCompletedTrips = Number(completedTripCountRow?.count || 0);
    const totalPoints = Number(pointCountRow?.count || 0);
    const completionRate = totalTrips ? roundToTwoDecimals((totalCompletedTrips / totalTrips) * 100) : 0;
    const avgPointsPerTrip = totalTrips ? roundToTwoDecimals(totalPoints / totalTrips) : 0;
    const avgGpsAccuracy = roundToTwoDecimals(Number(accuracyAverageRow?.avgAccuracy || 0));

    const durations = completedTrips
      .map((trip) => ({
        startedAt: trip.startedAt ? new Date(trip.startedAt).getTime() : null,
        endedAt: trip.endedAt ? new Date(trip.endedAt).getTime() : null
      }))
      .filter((trip) => Number.isFinite(trip.startedAt) && Number.isFinite(trip.endedAt) && trip.endedAt >= trip.startedAt)
      .map((trip) => trip.endedAt - trip.startedAt);

    const avgSessionDurationMs = durations.length
      ? roundToTwoDecimals(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
      : 0;

    const ingestAttempts = operationMetrics.recordLocation.attempts;
    const ingestSuccess = operationMetrics.recordLocation.success;
    const ingestFailure = operationMetrics.recordLocation.failure;
    const ingestSuccessRate = ingestAttempts ? roundToTwoDecimals((ingestSuccess / ingestAttempts) * 100) : 0;
    const avgIngestLatencyMs = ingestAttempts
      ? roundToTwoDecimals(operationMetrics.recordLocation.totalLatencyMs / ingestAttempts)
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      totalTrips,
      completedTrips: totalCompletedTrips,
      completionRate,
      totalPoints,
      avgPointsPerTrip,
      avgGpsAccuracy,
      avgSessionDurationMs,
      ingestAttempts,
      ingestSuccess,
      ingestFailure,
      ingestSuccessRate,
      avgIngestLatencyMs
    };
  };
});

function createMetricBucket() {
  return {
    attempts: 0,
    success: 0,
    failure: 0,
    totalLatencyMs: 0
  };
}

function roundToTwoDecimals(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
