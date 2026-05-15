const cds = require("@sap/cds");
const { SELECT } = cds.ql;
const { createSecurityContext, XsuaaService, XsaService } = require("@sap/xssec");

module.exports = cds.server;

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// Lazily built auth service – created once from XSUAA credentials on first request
let _authService = null;
const getAuthService = () => {
  if (_authService) return _authService;
  const { credentials, config: serviceConfig = {} } = cds.requires.auth || {};
  if (!credentials) return null;
  _authService = credentials.uaadomain
    ? new XsuaaService(credentials, serviceConfig)
    : new XsaService(credentials, serviceConfig);
  return _authService;
};

cds.on("bootstrap", (app) => {
  app.get("/tracker/path/:tripId", async (req, res, next) => {
    try {
      const { tripId } = req.params;
      const db = await cds.connect.to("db");
      const authConfig = cds.requires.auth || {};

      if (authConfig.kind === "xsuaa") {
        // Require a Bearer token
        if (!req.headers.authorization) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        const svc = getAuthService();
        if (!svc) {
          return res.status(500).json({ error: "XSUAA service not configured" });
        }

        // Verify the JWT – xssec extracts it from req.headers.authorization automatically
        let secCtx;
        try {
          secCtx = await createSecurityContext(svc, { req });
        } catch {
          return res.status(401).json({ error: "Invalid or expired token" });
        }

        const isDriver = secCtx.checkLocalScope("Driver");
        const isAdmin = secCtx.checkLocalScope("FleetAdmin");

        if (!isDriver && !isAdmin) {
          return res.status(403).json({ error: "Forbidden: requires Driver or FleetAdmin role" });
        }

        const email = normalizeEmail(secCtx.getLogonName());

        // Fetch the trip once – used by both role branches below
        const trip = await db.run(
          SELECT.one.from("tracker.Trips").where({ ID: tripId })
        );
        if (!trip) {
          return res.status(404).json({ error: "Trip not found" });
        }

        if (isDriver) {
          // Driver: trip must belong to the requesting driver
          const driver = await db.run(
            SELECT.one.from("tracker.Drivers").where({ email })
          );
          if (!driver || driver.status !== "ACTIVE") {
            return res.status(403).json({ error: "No active driver profile is assigned to this login" });
          }
          if (trip.driver_ID !== driver.ID) {
            return res.status(403).json({ error: "Drivers can only access their own trips" });
          }
        } else {
          // FleetAdmin: trip must belong to one of the admin's own drivers
          const admin = await db.run(
            SELECT.one.from("tracker.Admins").where({ email })
          );
          if (!admin) {
            return res.status(403).json({ error: "No admin profile found for this login" });
          }
          const driver = await db.run(
            SELECT.one.from("tracker.Drivers").where({ ID: trip.driver_ID })
          );
          if (!driver || driver.admin_ID !== admin.ID) {
            return res.status(403).json({ error: "Fleet admins can only access their own drivers' trips" });
          }
        }
      }

      const points = await db.run(
        SELECT.from("tracker.LocationPoints")
          .where({ trip_ID: tripId })
          .orderBy("recordedAt asc")
      );

      res.json({ value: points });
    } catch (error) {
      next(error);
    }
  });
});