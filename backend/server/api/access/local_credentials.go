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

const localBootstrapClaimKey = "default"

// LocalBootstrapInput contains the already-hashed credential supplied by
// provisioning. The access service owns the directory transaction and never
// receives a plaintext password.
type LocalBootstrapInput struct {
	LoginName    string
	PasswordHash string
}

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
		remaining, countErr := tx.Count(
			dal.From(&LocalCredential{}),
			dal.Join("JOIN auth_access_users ON auth_access_users.id = auth_local_credentials.access_user_id"),
			dal.Where("auth_access_users.status = ? AND auth_access_users.hidden_at IS NULL", StatusActive),
		)
		if countErr != nil {
			return nil, errors.Default.Wrap(countErr, "error checking remaining local credentials")
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
	ids, err := s.sessionRevoker.RevokePersistentSessions(tx, user)
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

func localUserSubject(loginName string) string { return "user:" + loginName }
