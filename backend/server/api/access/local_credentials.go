/*
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package access

import (
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

const localBootstrapClaimKey = "default"

// LocalBootstrapInput contains the already-hashed credential supplied by
// provisioning. The access service owns the directory transaction and never
// receives a plaintext password.
type LocalBootstrapInput struct {
	LoginName    string
	PasswordHash string
}

// ResolveActiveLocalCredential returns a credential only when its parent user
// remains visible and active. Authentication code uses this instead of joining
// credential and directory policy itself, so access admission stays owned here.
func (s *Service) ResolveActiveLocalCredential(loginName string) (*LocalCredential, *AccessUser, errors.Error) {
	credential := &LocalCredential{}
	if err := s.db.First(credential, dal.Where("login_name = ?", loginName)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, nil, errors.NotFound.New("local credential not found")
		}
		return nil, nil, errors.Default.Wrap(err, "error looking up local credential")
	}
	user := &AccessUser{}
	if err := s.db.First(user, dal.Where("id = ? AND status = ? AND hidden_at IS NULL", credential.AccessUserID, StatusActive)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, nil, errors.NotFound.New("local credential not found")
		}
		return nil, nil, errors.Default.Wrap(err, "error looking up local credential user")
	}
	return credential, user, nil
}

// ResolveActiveLocalCredentialByUserID is the session-bound form used by the
// password-change flow. It never accepts a browser-supplied account identifier.
func (s *Service) ResolveActiveLocalCredentialByUserID(userID uint64) (*LocalCredential, *AccessUser, errors.Error) {
	credential := &LocalCredential{}
	if err := s.db.First(credential, dal.Where("access_user_id = ?", userID)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, nil, errors.NotFound.New("local credential not found")
		}
		return nil, nil, errors.Default.Wrap(err, "error looking up local credential")
	}
	user := &AccessUser{}
	if err := s.db.First(user, dal.Where("id = ? AND status = ? AND hidden_at IS NULL", userID, StatusActive)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, nil, errors.NotFound.New("local credential not found")
		}
		return nil, nil, errors.Default.Wrap(err, "error looking up local credential user")
	}
	return credential, user, nil
}

// BootstrapLocalAdministrator creates the one initial local administrator only
// when the access directory is empty. Its durable claim makes retries across
// replicas idempotent and prevents later configuration changes from resetting it.
func (s *Service) BootstrapLocalAdministrator(input LocalBootstrapInput) (*AccessUser, bool, errors.Error) {
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback local bootstrap")
			}
		}
	}()

	count, err := tx.Count(dal.From(&AccessUser{}))
	if err != nil {
		return nil, false, errors.Default.Wrap(err, "error checking local bootstrap state")
	}
	if count != 0 {
		return nil, false, nil
	}
	if err := tx.Create(&LocalBootstrapClaim{Key: localBootstrapClaimKey}); err != nil {
		if !tx.IsDuplicationError(err) {
			return nil, false, errors.Default.Wrap(err, "error claiming local bootstrap administrator")
		}
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return nil, false, errors.Default.Wrap(rollbackErr, "error rolling back local bootstrap claim")
		}
		committed = true
		credential, user, lookupErr := s.ResolveActiveLocalCredential(input.LoginName)
		if lookupErr != nil {
			return nil, false, errors.Unauthorized.New("the local bootstrap administrator has already been claimed")
		}
		if credential.LoginName != input.LoginName || user.Role != RoleCustomerAdmin {
			return nil, false, errors.Unauthorized.New("the local bootstrap administrator has already been claimed")
		}
		return user, false, nil
	}

	user := &AccessUser{
		Issuer:      localAccessIdentityIssuer,
		Subject:     localBootstrapSubject(input.LoginName),
		DisplayName: input.LoginName,
		Role:        RoleCustomerAdmin,
		Status:      StatusActive,
	}
	if err := tx.Create(user); err != nil {
		return nil, false, errors.Default.Wrap(err, "error creating local bootstrap administrator")
	}
	now := time.Now()
	credential := &LocalCredential{
		AccessUserID:       user.ID,
		LoginName:          input.LoginName,
		PasswordHash:       input.PasswordHash,
		PasswordChangedAt:  &now,
		MustChangePassword: true,
	}
	if err := tx.Create(credential); err != nil {
		return nil, false, errors.Default.Wrap(err, "error creating local bootstrap credential")
	}
	if err := tx.Commit(); err != nil {
		return nil, false, errors.Default.Wrap(err, "error committing local bootstrap administrator")
	}
	committed = true
	s.audit("", "local.bootstrap_consumed", user, "")
	s.logger.Info("access: local bootstrap administrator provisioned user_id=%d", user.ID)
	return user, true, nil
}

// ReplaceLocalPassword changes an existing local credential and revokes all
// prior local sessions in the same directory transaction.
func (s *Service) ReplaceLocalPassword(userID uint64, passwordHash string) (*AccessUser, []string, errors.Error) {
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback local password change user_id=%d", userID)
			}
		}
	}()

	credential := &LocalCredential{}
	if err := tx.First(credential, dal.Where("access_user_id = ?", userID), dal.Lock(true, false)); err != nil {
		if tx.IsErrorNotFound(err) {
			return nil, nil, errors.Unauthorized.New("local credential is not available")
		}
		return nil, nil, errors.Default.Wrap(err, "error loading local credential")
	}
	user := &AccessUser{}
	if err := tx.First(user, dal.Where("id = ? AND status = ? AND hidden_at IS NULL", userID, StatusActive), dal.Lock(true, false)); err != nil {
		if tx.IsErrorNotFound(err) {
			return nil, nil, errors.Unauthorized.New("this account is disabled")
		}
		return nil, nil, errors.Default.Wrap(err, "error loading local access user")
	}
	now := time.Now()
	credential.PasswordHash = passwordHash
	credential.PasswordChangedAt = &now
	credential.MustChangePassword = false
	if err := tx.Update(credential); err != nil {
		return nil, nil, errors.Default.Wrap(err, "error updating local credential")
	}
	var revokedSessionIDs []string
	if s.sessionRevoker != nil {
		ids, err := s.sessionRevoker.RevokePersistentSessions(tx, user)
		if err != nil {
			return nil, nil, errors.Default.Wrap(err, "error revoking local sessions")
		}
		revokedSessionIDs = ids
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, errors.Default.Wrap(err, "error committing local password change")
	}
	committed = true
	if s.sessionRevoker != nil {
		s.sessionRevoker.CacheRevokedSessions(revokedSessionIDs)
	}
	s.audit("", "local.password_changed", user, "")
	return user, revokedSessionIDs, nil
}

// RefreshLocalPasswordHash upgrades a credential after a successful password
// verification. Unlike an administrative reset or user-driven password change,
// it preserves MustChangePassword and does not revoke sessions or create an
// audit event.
func (s *Service) RefreshLocalPasswordHash(userID uint64, passwordHash string) errors.Error {
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback local password hash refresh user_id=%d", userID)
			}
		}
	}()
	credential := &LocalCredential{}
	if err := tx.First(credential, dal.Where("access_user_id = ?", userID), dal.Lock(true, false)); err != nil {
		if tx.IsErrorNotFound(err) {
			return errors.Unauthorized.New("local credential is not available")
		}
		return errors.Default.Wrap(err, "error loading local credential for hash refresh")
	}
	credential.PasswordHash = passwordHash
	if err := tx.Update(credential); err != nil {
		return errors.Default.Wrap(err, "error refreshing local credential hash")
	}
	if err := tx.Commit(); err != nil {
		return errors.Default.Wrap(err, "error committing local credential hash refresh")
	}
	committed = true
	return nil
}

const localAccessIdentityIssuer = "local"

func localBootstrapSubject(loginName string) string { return "bootstrap:" + loginName }
