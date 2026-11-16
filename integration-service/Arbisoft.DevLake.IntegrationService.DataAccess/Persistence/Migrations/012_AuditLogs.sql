-- The audit trail: one row for each change, action or sign-in, by a portal user, by the service itself, or by an API client.
-- Rows are only ever inserted; nothing in the service updates or deletes them, and they are kept indefinitely.
-- changes holds the field-level differences as a JSON array of {field, old, new, hidden}; a hidden field (a secret) carries no values.
-- Purely additive. To roll back, drop the table.

CREATE TABLE AuditLogs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  occurredOn DATETIME(6) NOT NULL,
  actorKind VARCHAR(20) NOT NULL,
  actorId VARCHAR(255) NULL,
  actorName VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  entityType VARCHAR(50) NOT NULL,
  entityId VARCHAR(100) NOT NULL,
  entityLabel VARCHAR(255) NULL,
  changes JSON NULL,
  reason VARCHAR(500) NULL,
  ipAddress VARCHAR(45) NULL,
  traceId VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY IX_AuditLogs_entity (entityType, entityId, occurredOn),
  KEY IX_AuditLogs_occurredOn (occurredOn),
  KEY IX_AuditLogs_actor (actorKind, occurredOn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
