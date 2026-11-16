-- RequestLogs.modifiedOn is when the row was last changed: a status change, a claim by a worker, a deferral, a retry or the release of its
-- idempotency key. NULL for a request that has never been changed since it was received (and for rows from before this migration).
-- Purely additive. To roll back, drop the column.

ALTER TABLE RequestLogs
  ADD COLUMN modifiedOn DATETIME(6) NULL AFTER createdOn;
