using tracker from '../db/schema';

service TrackerService @(path : '/tracker') {
  entity Users as projection on tracker.Users;
  entity Trips as projection on tracker.Trips;
  entity LocationPoints as projection on tracker.LocationPoints;
  entity MetricSnapshots as projection on tracker.MetricSnapshots;

  // Authentication
  action authenticate(username: String, password: String, role: String) returns {
    username: String;
    fullName: String;
    email: String;
    role: String;
  };

  // Supervisor/Admin functions
  function getAllDrivers() returns array of {
    username: String;
    fullName: String;
    email: String;
    status: String;
    currentTrip: String;
    lastLocation: {
      latitude: Decimal(9, 6);
      longitude: Decimal(9, 6);
    };
    lastUpdate: Timestamp;
  };

  function getDriverTrips(driverUsername: String) returns array of {
    ID: UUID;
    title: String;
    startedAt: Timestamp;
    endedAt: Timestamp;
    status: String;
    pointsCount: Integer;
    distance: Decimal;
  };

  function getTripsStatistics() returns {
    totalTrips: Integer;
    completedTrips: Integer;
    activeTrips: Integer;
  };

  // Driver functions
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
