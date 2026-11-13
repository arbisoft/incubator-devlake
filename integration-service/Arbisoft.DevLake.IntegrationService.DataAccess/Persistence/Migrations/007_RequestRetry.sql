-- queuedOn is when a request last entered processing: when it was received, or when an administrator retried it after it failed. The request
-- lifetime and the count of delivery attempts are measured from it, so a retried request gets a fresh lifetime and a fresh set of attempts,
-- while createdOn keeps the time the client sent it. Existing rows start from their createdOn.
-- To roll back, drop the index and the column.

ALTER TABLE RequestLogs
  ADD COLUMN queuedOn DATETIME(6) NULL AFTER createdOn;

UPDATE RequestLogs SET queuedOn = createdOn;

ALTER TABLE RequestLogs
  MODIFY queuedOn DATETIME(6) NOT NULL,
  ADD KEY IX_RequestLogs_status_queuedOn (status, queuedOn);
