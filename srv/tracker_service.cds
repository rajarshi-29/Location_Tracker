using tracker from '../db/schema';

service TrackerService @(path : '/tracker') {
  entity Trips as projection on tracker.Trips;
  entity LocationPoints as projection on tracker.LocationPoints;
  entity MetricSnapshots as projection on tracker.MetricSnapshots;

  action startTrip(title : String) returns Trips;
  action stopTrip(tripId : UUID) returns Trips;
  action recordLocation(
    tripId      : UUID,
    latitude    : Decimal(9, 6),
    longitude   : Decimal(9, 6),
    accuracy    : Decimal(9, 2),
    altitude    : Decimal(9, 2),
    speed       : Decimal(9, 2),
    heading     : Decimal(9, 2),
    recordedAt  : Timestamp,
    source      : String(30)
  ) returns LocationPoints;
  function activeTrip() returns Trips;
  function metrics() returns TrackerMetrics;
}

type TrackerMetrics {
  generatedAt          : Timestamp;
  totalTrips           : Integer;
  completedTrips       : Integer;
  completionRate       : Decimal(5, 2);
  totalPoints          : Integer;
  avgPointsPerTrip     : Decimal(9, 2);
  avgGpsAccuracy       : Decimal(9, 2);
  avgSessionDurationMs : Decimal(15, 2);
  ingestAttempts       : Integer;
  ingestSuccess        : Integer;
  ingestFailure        : Integer;
  ingestSuccessRate    : Decimal(5, 2);
  avgIngestLatencyMs   : Decimal(9, 2);
}
