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

const (
	localAccessIdentityIssuer = "local"
	localBootstrapClaimKey    = "default"
)

// LocalBootstrapInput contains the already-hashed credential supplied by
// provisioning. The access service owns the directory transaction and never
// receives a plaintext password.
type LocalBootstrapInput struct {
	LoginName    string
	PasswordHash string
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

func localBootstrapSubject(loginName string) string { return "bootstrap:" + loginName }

func localUserSubject(loginName string) string { return "user:" + loginName }
