-- Records who last saved a secret store entry, so the admin portal can show who set an upstream API token (DevLake, Workstream) and when.
-- NULL for entries the service writes itself, such as signing keys created at rotation. Purely additive. To roll back, drop the column.

ALTER TABLE SecretStoreEntries
  ADD COLUMN modifiedBy VARCHAR(255) NULL AFTER modifiedOn;
