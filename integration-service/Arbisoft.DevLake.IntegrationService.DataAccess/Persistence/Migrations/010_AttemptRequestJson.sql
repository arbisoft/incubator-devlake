-- RequestResponseAttempts.requestJson keeps the body that was sent to the client's callback on that delivery attempt, so an administrator can
-- see what the client received after the request has finished (RequestPayloads is dropped when it does). It is MEDIUMTEXT, not JSON, so the
-- body is shown byte for byte as it was sent. NULL for attempts that sent nothing (a fetch failure, an expiry) and for attempts made before
-- this migration. It holds engineers' data, so only the admin portal reads it.
-- Purely additive. To roll back, drop the column.

ALTER TABLE RequestResponseAttempts
  ADD COLUMN requestJson MEDIUMTEXT NULL AFTER responseJson;
