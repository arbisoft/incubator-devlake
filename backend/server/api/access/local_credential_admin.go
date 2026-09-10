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
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

// CreateLocalUser creates a local-only directory user and its forced-change
// credential in one transaction. Password construction stays in auth; access
// persists only the supplied hash and owns authorization state and auditing.
func (s *Service) CreateLocalUser(actor string, input CreateLocalUserInput) (*LocalCredentialResponse, errors.Error) {
	if !validRole(input.Role) {
		return nil, errors.BadInput.New("provide a valid role", errors.WithData(ErrCodeInvalidUser))
	}
	material, err := s.prepareLocalCredential(input.LoginName)
	if err != nil {
		return nil, err
	}
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback local user create login_name=%s", material.LoginName)
			}
		}
	}()

	if err := tx.First(&LocalCredential{}, dal.Where("login_name = ?", material.LoginName), dal.Lock(true, false)); err == nil {
		return nil, errors.BadInput.New("this local username already has a DevLake credential", errors.WithData(ErrCodeDuplicateUser))
	} else if !tx.IsErrorNotFound(err) {
		return nil, errors.Default.Wrap(err, "error looking up local username")
	}
	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		displayName = material.LoginName
	}
	user := &AccessUser{
		Issuer:      localAccessIdentityIssuer,
		Subject:     localUserSubject(material.LoginName),
		DisplayName: displayName,
		Role:        input.Role,
		Status:      StatusActive,
	}
	if err := tx.Create(user); err != nil {
		return nil, errors.Default.Wrap(err, "error creating local access user")
	}
	if err := tx.Create(&LocalCredential{
		AccessUserID:       user.ID,
		LoginName:          material.LoginName,
		PasswordHash:       material.PasswordHash,
		MustChangePassword: true,
	}); err != nil {
		if tx.IsDuplicationError(err) {
			return nil, errors.BadInput.New("this local username already has a DevLake credential", errors.WithData(ErrCodeDuplicateUser))
		}
		return nil, errors.Default.Wrap(err, "error creating local credential")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing local access user")
	}
	committed = true
	s.audit(actor, "local.user_created", user, localCredentialAuditDetail(material.LoginName))
	return localCredentialResponse(user, material), nil
}

// AddLocalCredential grants an existing active directory user a separate
// password method. It cannot replace an existing credential; reset is a
// deliberate and auditable operation.
func (s *Service) AddLocalCredential(actor string, userID uint64, loginName string) (*LocalCredentialResponse, errors.Error) {
	material, err := s.prepareLocalCredential(loginName)
	if err != nil {
		return nil, err
	}
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback local credential add user_id=%d", userID)
			}
		}
	}()
	user, err := activeVisibleUser(tx, userID)
	if err != nil {
		return nil, err
	}
	if err := tx.First(&LocalCredential{}, dal.Where("access_user_id = ?", userID), dal.Lock(true, false)); err == nil {
		return nil, errors.BadInput.New("this user already has a local credential", errors.WithData(ErrCodeDuplicateUser))
	} else if !tx.IsErrorNotFound(err) {
		return nil, errors.Default.Wrap(err, "error looking up user local credential")
	}
	if err := tx.First(&LocalCredential{}, dal.Where("login_name = ?", material.LoginName), dal.Lock(true, false)); err == nil {
		return nil, errors.BadInput.New("this local username already has a DevLake credential", errors.WithData(ErrCodeDuplicateUser))
	} else if !tx.IsErrorNotFound(err) {
		return nil, errors.Default.Wrap(err, "error looking up local username")
	}
	if err := tx.Create(&LocalCredential{
		AccessUserID:       user.ID,
		LoginName:          material.LoginName,
		PasswordHash:       material.PasswordHash,
		MustChangePassword: true,
	}); err != nil {
		if tx.IsDuplicationError(err) {
			return nil, errors.BadInput.New("this local username already has a DevLake credential", errors.WithData(ErrCodeDuplicateUser))
		}
		return nil, errors.Default.Wrap(err, "error creating user local credential")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing user local credential")
	}
	committed = true
	s.audit(actor, "local.credential_added", user, localCredentialAuditDetail(material.LoginName))
	return localCredentialResponse(user, material), nil
}

// ResetLocalCredential replaces a user credential with a forced-change
// temporary password and revokes all existing native sessions transactionally.
func (s *Service) ResetLocalCredential(actor string, userID uint64) (*LocalCredentialResponse, errors.Error) {
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback local credential reset user_id=%d", userID)
			}
		}
	}()
	user, err := activeVisibleUser(tx, userID)
	if err != nil {
		return nil, err
	}
	credential := &LocalCredential{}
	if err := tx.First(credential, dal.Where("access_user_id = ?", userID), dal.Lock(true, false)); err != nil {
		if tx.IsErrorNotFound(err) {
			return nil, errors.NotFound.New("local credential not found", errors.WithData(ErrCodeLocalCredentialMissing))
		}
		return nil, errors.Default.Wrap(err, "error loading local credential for reset")
	}
	material, preparationErr := s.prepareLocalCredential(credential.LoginName)
	if preparationErr != nil {
		return nil, preparationErr
	}
	now := time.Now()
	credential.PasswordHash = material.PasswordHash
	credential.PasswordChangedAt = &now
	credential.MustChangePassword = true
	if err := tx.Update(credential); err != nil {
		return nil, errors.Default.Wrap(err, "error resetting local credential")
	}
	revokedSessionIDs, revokeErr := s.revokeUserSessions(tx, user)
	if revokeErr != nil {
		return nil, revokeErr
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing local credential reset")
	}
	committed = true
	s.cacheRevokedSessions(revokedSessionIDs)
	s.audit(actor, "local.credential_reset", user, localCredentialAuditDetail(credential.LoginName))
	return localCredentialResponse(user, material), nil
}

// RemoveLocalCredential removes only a password method. It refuses to leave the
// deployment without an enabled OIDC provider or any active local credential.
func (s *Service) RemoveLocalCredential(actor string, userID uint64) (*AccessUser, errors.Error) {
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback local credential removal user_id=%d", userID)
			}
		}
	}()
	if !s.hasEnabledOIDCProvider() {
		// Lock the credential set before a target row. This gives concurrent
		// removals one ordering, so they cannot each observe two credentials and
		// both remove the final interactive methods.
		lockedCredentials := make([]LocalCredential, 0)
		if err := tx.All(&lockedCredentials, dal.Lock(true, false)); err != nil {
			return nil, errors.Default.Wrap(err, "error locking local credentials")
		}
	}
	user, err := activeVisibleUser(tx, userID)
	if err != nil {
		return nil, err
	}
	credential := &LocalCredential{}
	if err := tx.First(credential, dal.Where("access_user_id = ?", userID), dal.Lock(true, false)); err != nil {
		if tx.IsErrorNotFound(err) {
			return nil, errors.NotFound.New("local credential not found", errors.WithData(ErrCodeLocalCredentialMissing))
		}
		return nil, errors.Default.Wrap(err, "error loading local credential for removal")
	}
	if !s.hasEnabledOIDCProvider() {
		remaining, countErr := countActiveLocalCredentials(tx)
		if countErr != nil {
			return nil, countErr
		}
		if remaining <= 1 {
			return nil, errors.BadInput.New("keep at least one interactive login method", errors.WithData(ErrCodeLastLoginMethod))
		}
	}
	if err := tx.Delete(credential); err != nil {
		return nil, errors.Default.Wrap(err, "error removing local credential")
	}
	revokedSessionIDs, revokeErr := s.revokeUserSessions(tx, user)
	if revokeErr != nil {
		return nil, revokeErr
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing local credential removal")
	}
	committed = true
	s.cacheRevokedSessions(revokedSessionIDs)
	s.audit(actor, "local.credential_removed", user, localCredentialAuditDetail(credential.LoginName))
	return user, nil
}
