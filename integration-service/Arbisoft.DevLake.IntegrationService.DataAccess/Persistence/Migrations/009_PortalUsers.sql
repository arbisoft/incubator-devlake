-- The people who use the admin portal, kept in the database instead of configuration. A user is either local (username and password hash; only
-- the seeded administrator) or signs in with an Arbisoft account through single sign-on (email). role is None until an administrator grants
-- Editor (see and change everything) or Admin (Editor, plus managing portal users). A signed-in user's role is read on every request, so a
-- change takes effect at once. To roll back, drop PortalUsers.

CREATE TABLE PortalUsers (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  passwordHash VARCHAR(255) NULL,
  mustChangePassword TINYINT(1) NOT NULL DEFAULT 0,
  email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  displayName VARCHAR(255) NULL,
  role VARCHAR(20) NOT NULL,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  lastSignInOn DATETIME(6) NULL,
  createdOn DATETIME(6) NOT NULL,
  createdBy VARCHAR(255) NOT NULL,
  modifiedOn DATETIME(6) NULL,
  modifiedBy VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY UX_PortalUsers_username (username),
  UNIQUE KEY UX_PortalUsers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed: the first administrator, only when there is no user at all. Username admin, password admin, which must be changed at the first
-- sign-in before anything else in the portal can be used. The value is a PBKDF2-SHA256 hash in the service's usual format, never the
-- password. Its dollar-sign separators are written as CHAR(36), because DbUp reads text between two dollar signs in a script as a variable.
INSERT INTO PortalUsers (username, passwordHash, mustChangePassword, displayName, role, isActive, createdOn, createdBy)
SELECT 'admin', CONCAT('pbkdf2-sha256', CHAR(36), '210000', CHAR(36), '8UQxxQO/a2WLkL38o641cA==', CHAR(36), 'XNksKvhEx1OC05UMrx8Nrj45ELJE7E52WkP6oVkUJJc='), 1, 'Administrator', 'Admin', 1, UTC_TIMESTAMP(6), 'seed'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PortalUsers);
