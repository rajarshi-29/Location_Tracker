namespace tracker;
using { cuid, managed } from '@sap/cds/common';

entity Users : cuid, managed {
  username  : String(100) not null;
  password  : String(255) not null;
  email     : String(100);
  fullName  : String(150);
  role      : String(20) enum {
    DRIVER;
    SUPERVISOR;
  } default 'DRIVER';
  isActive  : Boolean default true;
  key username : String(100);
}

entity Trips : cuid, managed {
  title     : String(120);
  driver    : Association to Users;
  startedAt : Timestamp;
  endedAt   : Timestamp;
  status    : String(20) enum {
    ACTIVE;
    COMPLETED;
    PAUSED;
  } default 'ACTIVE';
  points    : Composition of many LocationPoints on points.trip = $self;
}
entity LocationPoints : cuid, managed {
  trip       : Association to Trips not null;
  latitude   : Decimal(9, 6);
  longitude  : Decimal(9, 6);
  accuracy   : Decimal(9, 2);
  altitude   : Decimal(9, 2);
  speed      : Decimal(9, 2);
  heading    : Decimal(9, 2);
  recordedAt : Timestamp;
  source     : String(30);
}

entity MetricSnapshots : cuid, managed {
  capturedAt           : Timestamp;
  totalTrips           : Integer;
  completedTrips       : Integer;
  completionRate       : Decimal(5, 2);
  totalPoints          : Integer;
  avgPointsPerTrip     : Decimal(9, 2);
  avgGpsAccuracy       : Decimal(9, 2);
  avgSessionDurationMs : Decimal(15, 2);
  ingestSuccessRate    : Decimal(5, 2);
  avgIngestLatencyMs   : Decimal(9, 2);
}
