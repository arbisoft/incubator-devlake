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

func (s *Service) prepareLocalCredential(loginName string) (*LocalCredentialMaterial, errors.Error) {
	if s.localGenerator == nil {
		return nil, errors.Unavailable.New("local password authentication is not enabled")
	}
	material, err := s.localGenerator.PrepareLocalCredential(loginName)
	if err != nil {
		return nil, err
	}
	return material, nil
}

func activeVisibleUser(tx dal.Transaction, userID uint64) (*AccessUser, errors.Error) {
	user := &AccessUser{}
	if err := tx.First(user, dal.Where("id = ? AND status = ? AND hidden_at IS NULL", userID, StatusActive), dal.Lock(true, false)); err != nil {
		if tx.IsErrorNotFound(err) {
			return nil, errors.NotFound.New("active access user not found")
		}
		return nil, errors.Default.Wrap(err, "error loading active access user")
	}
	return user, nil
}

func (s *Service) revokeUserSessions(tx dal.Transaction, user *AccessUser) ([]string, errors.Error) {
	if s.sessionRevoker == nil {
		return nil, nil
	}
	ids, err := s.sessionRevoker.RevokeLocalSessions(tx, user.ID)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error revoking user sessions")
	}
	return ids, nil
}

func (s *Service) cacheRevokedSessions(ids []string) {
	if s.sessionRevoker != nil && len(ids) > 0 {
		s.sessionRevoker.CacheRevokedSessions(ids)
	}
}

func (s *Service) hasEnabledOIDCProvider() bool {
	return s.oidcMethods != nil && s.oidcMethods.HasEnabledOIDCProvider()
}

func localCredentialResponse(user *AccessUser, material *LocalCredentialMaterial) *LocalCredentialResponse {
	user.LocalLoginName = material.LoginName
	user.HasLocalCredential = true
	return &LocalCredentialResponse{User: user, LoginName: material.LoginName, TemporaryPassword: material.TemporaryPassword}
}

func localCredentialAuditDetail(loginName string) string { return "login_name=" + loginName }

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
		ids, err := s.sessionRevoker.RevokeLocalSessions(tx, user.ID)
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
