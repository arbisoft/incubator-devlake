-- Once the processing job takes a request off the queue, the database row owns it: a request that has to wait (a failed delivery, refused
-- credentials, DevLake down) is deferred to nextAttemptOn instead of being held in the queue or slept on in memory. claimedUntil is the lease
-- of whoever is working on the request; an UPDATE that only succeeds when no unexpired lease exists is what stops two workers taking the
-- same request, and a lease that runs out (a crash) makes the request claimable again.
-- RequestPayloads keeps the collected callback body while a request is unfinished, so every delivery attempt sends the same result. It is
-- MEDIUMTEXT, not JSON, so the body is sent byte for byte as it was built. The row is deleted when the request finishes.
-- Purely additive. To roll back, drop RequestPayloads, the index and the two columns.

ALTER TABLE RequestLogs
  ADD COLUMN nextAttemptOn DATETIME(6) NULL AFTER status,
  ADD COLUMN claimedUntil DATETIME(6) NULL AFTER nextAttemptOn,
  ADD KEY IX_RequestLogs_nextAttemptOn (nextAttemptOn);

CREATE TABLE RequestPayloads (
  requestLogId BIGINT NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  createdOn DATETIME(6) NOT NULL,
  PRIMARY KEY (requestLogId),
  CONSTRAINT FK_RequestPayloads_RequestLogs FOREIGN KEY (requestLogId) REFERENCES RequestLogs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
