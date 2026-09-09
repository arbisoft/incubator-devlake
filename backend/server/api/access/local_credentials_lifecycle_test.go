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
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/unithelper"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/mock"
)

func TestRemoveLocalCredentialRejectsFinalInteractiveMethod(t *testing.T) {
	db := dalmocks.NewDal(t)
	tx := dalmocks.NewTransaction(t)
	db.EXPECT().Begin().Return(tx)
	tx.EXPECT().All(mock.Anything, mock.Anything).Return(nil)
	tx.EXPECT().First(mock.Anything, mock.Anything).Run(func(destination interface{}, _ ...dal.Clause) {
		switch value := destination.(type) {
		case *AccessUser:
			value.ID = 42
			value.Status = StatusActive
		case *LocalCredential:
			value.AccessUserID = 42
			value.LoginName = "admin"
		}
	}).Return(nil).Twice()
	tx.EXPECT().Count(mock.Anything).Return(int64(1), nil)
	tx.EXPECT().Rollback().Return(nil)

	_, err := (&Service{db: db}).RemoveLocalCredential("admin", 42)
	if err == nil || err.GetData() != ErrCodeLastLoginMethod {
		t.Fatalf("RemoveLocalCredential() error = %v, want last-login-method rejection", err)
	}
}

type enabledOIDCMethodChecker struct{}

func (enabledOIDCMethodChecker) HasEnabledOIDCProvider() bool { return true }

type localCredentialSessionRevoker struct {
	localUserIDs []uint64
	cachedIDs    []string
}

type localCredentialGeneratorStub struct{}

func (localCredentialGeneratorStub) PrepareLocalCredential(loginName string) (*LocalCredentialMaterial, errors.Error) {
	return &LocalCredentialMaterial{
		LoginName:         loginName,
		PasswordHash:      "hashed-" + loginName,
		TemporaryPassword: "temporary-password",
	}, nil
}

func (r *localCredentialSessionRevoker) RevokePersistentSessions(dal.Transaction, []string, string) ([]string, errors.Error) {
	return nil, nil
}

func (r *localCredentialSessionRevoker) RevokeLocalSessions(_ dal.Transaction, userID uint64) ([]string, errors.Error) {
	r.localUserIDs = append(r.localUserIDs, userID)
	return []string{"local-session-1"}, nil
}

func (r *localCredentialSessionRevoker) CacheRevokedSessions(ids []string) {
	r.cachedIDs = append(r.cachedIDs, ids...)
}

func TestRemoveLocalCredentialRevokesActiveLocalSessions(t *testing.T) {
	db := dalmocks.NewDal(t)
	tx := dalmocks.NewTransaction(t)
	db.EXPECT().Begin().Return(tx)
	tx.EXPECT().First(mock.Anything, mock.Anything).Run(func(destination interface{}, _ ...dal.Clause) {
		switch value := destination.(type) {
		case *AccessUser:
			value.ID = 42
			value.Status = StatusActive
		case *LocalCredential:
			value.AccessUserID = 42
			value.LoginName = "member"
		}
	}).Return(nil).Twice()
	tx.EXPECT().Delete(mock.Anything).Return(nil)
	tx.EXPECT().Commit().Return(nil)
	db.EXPECT().Create(mock.MatchedBy(func(entity interface{}) bool {
		event, ok := entity.(*AuditEvent)
		return ok && event.Action == "local.credential_removed" && event.TargetID == 42
	})).Return(nil)

	revoker := &localCredentialSessionRevoker{}
	service := &Service{
		db:             db,
		logger:         unithelper.DummyLogger(),
		oidcMethods:    enabledOIDCMethodChecker{},
		sessionRevoker: revoker,
	}
	if _, err := service.RemoveLocalCredential("admin", 42); err != nil {
		t.Fatalf("RemoveLocalCredential() error = %v", err)
	}
	if len(revoker.localUserIDs) != 1 || revoker.localUserIDs[0] != 42 {
		t.Fatalf("RevokeLocalSessions() user IDs = %v, want [42]", revoker.localUserIDs)
	}
	if len(revoker.cachedIDs) != 1 || revoker.cachedIDs[0] != "local-session-1" {
		t.Fatalf("CacheRevokedSessions() IDs = %v, want [local-session-1]", revoker.cachedIDs)
	}
}

func TestResetLocalCredentialRevokesSessionsBeforeCommitAndCachesAfterward(t *testing.T) {
	db := dalmocks.NewDal(t)
	tx := dalmocks.NewTransaction(t)
	revoker := &localCredentialSessionRevoker{}
	db.EXPECT().Begin().Return(tx)
	tx.EXPECT().First(mock.Anything, mock.Anything).Run(func(destination interface{}, _ ...dal.Clause) {
		switch value := destination.(type) {
		case *AccessUser:
			value.ID = 42
			value.Status = StatusActive
		case *LocalCredential:
			value.AccessUserID = 42
			value.LoginName = "member"
		}
	}).Return(nil).Twice()
	tx.EXPECT().Update(mock.Anything).Return(nil)
	tx.EXPECT().Commit().Run(func() {
		if len(revoker.localUserIDs) != 1 || revoker.localUserIDs[0] != 42 {
			t.Fatalf("RevokeLocalSessions() must run before commit, got %v", revoker.localUserIDs)
		}
		if len(revoker.cachedIDs) != 0 {
			t.Fatalf("CacheRevokedSessions() must run after commit, got %v", revoker.cachedIDs)
		}
	}).Return(nil)
	db.EXPECT().Create(mock.MatchedBy(func(entity interface{}) bool {
		event, ok := entity.(*AuditEvent)
		return ok && event.Action == "local.credential_reset" && event.TargetID == 42
	})).Return(nil)

	service := &Service{db: db, logger: unithelper.DummyLogger(), localGenerator: localCredentialGeneratorStub{}, sessionRevoker: revoker}
	if _, err := service.ResetLocalCredential("local:1", 42); err != nil {
		t.Fatalf("ResetLocalCredential() error = %v", err)
	}
	if len(revoker.cachedIDs) != 1 || revoker.cachedIDs[0] != "local-session-1" {
		t.Fatalf("CacheRevokedSessions() IDs = %v, want [local-session-1]", revoker.cachedIDs)
	}
}

func TestReplaceLocalPasswordRevokesSessionsBeforeCommitAndCachesAfterward(t *testing.T) {
	db := dalmocks.NewDal(t)
	tx := dalmocks.NewTransaction(t)
	revoker := &localCredentialSessionRevoker{}
	db.EXPECT().Begin().Return(tx)
	tx.EXPECT().First(mock.Anything, mock.Anything).Run(func(destination interface{}, _ ...dal.Clause) {
		switch value := destination.(type) {
		case *AccessUser:
			value.ID = 42
			value.Status = StatusActive
		case *LocalCredential:
			value.AccessUserID = 42
			value.LoginName = "member"
		}
	}).Return(nil).Twice()
	tx.EXPECT().Update(mock.Anything).Return(nil)
	tx.EXPECT().Commit().Run(func() {
		if len(revoker.localUserIDs) != 1 || revoker.localUserIDs[0] != 42 {
			t.Fatalf("RevokeLocalSessions() must run before commit, got %v", revoker.localUserIDs)
		}
		if len(revoker.cachedIDs) != 0 {
			t.Fatalf("CacheRevokedSessions() must run after commit, got %v", revoker.cachedIDs)
		}
	}).Return(nil)
	db.EXPECT().Create(mock.MatchedBy(func(entity interface{}) bool {
		event, ok := entity.(*AuditEvent)
		return ok && event.Action == "local.password_changed" && event.TargetID == 42
	})).Return(nil)

	service := &Service{db: db, logger: unithelper.DummyLogger(), sessionRevoker: revoker}
	if _, _, err := service.ReplaceLocalPassword(42, "replacement-hash"); err != nil {
		t.Fatalf("ReplaceLocalPassword() error = %v", err)
	}
	if len(revoker.cachedIDs) != 1 || revoker.cachedIDs[0] != "local-session-1" {
		t.Fatalf("CacheRevokedSessions() IDs = %v, want [local-session-1]", revoker.cachedIDs)
	}
}

func TestOutputLocalCredentialDisablesResponseCaching(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)

	outputLocalCredential(context, &LocalCredentialResponse{TemporaryPassword: "temporary-password"}, http.StatusCreated)

	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
}

func TestBootstrapLocalAdministratorCreatesClaimCredentialAndAuditEvent(t *testing.T) {
	db := dalmocks.NewDal(t)
	tx := dalmocks.NewTransaction(t)
	db.EXPECT().Begin().Return(tx)
	tx.EXPECT().Count(mock.Anything).Return(int64(0), nil)
	tx.EXPECT().Create(mock.Anything).Run(func(entity interface{}, _ ...dal.Clause) {
		if user, ok := entity.(*AccessUser); ok {
			user.ID = 42
		}
	}).Return(nil).Times(3)
	tx.EXPECT().Commit().Return(nil)
	db.EXPECT().Create(mock.MatchedBy(func(entity interface{}) bool {
		event, ok := entity.(*AuditEvent)
		return ok && event.Action == "local.bootstrap_consumed" && event.TargetID == 42
	})).Return(nil)

	service := &Service{db: db, logger: unithelper.DummyLogger()}
	user, created, err := service.BootstrapLocalAdministrator(LocalBootstrapInput{
		LoginName:    "admin",
		PasswordHash: "$argon2id$test",
	})
	if err != nil {
		t.Fatalf("BootstrapLocalAdministrator() error = %v", err)
	}
	if !created || user == nil || user.ID != 42 || user.Role != RoleCustomerAdmin || user.Status != StatusActive {
		t.Fatalf("BootstrapLocalAdministrator() = (%#v, %t), want created customer administrator", user, created)
	}
}

func TestBootstrapLocalAdministratorDoesNotResetInitializedDirectory(t *testing.T) {
	db := dalmocks.NewDal(t)
	tx := dalmocks.NewTransaction(t)
	db.EXPECT().Begin().Return(tx)
	tx.EXPECT().Count(mock.Anything).Return(int64(1), nil)
	tx.EXPECT().Rollback().Return(nil)

	service := &Service{db: db, logger: unithelper.DummyLogger()}
	user, created, err := service.BootstrapLocalAdministrator(LocalBootstrapInput{
		LoginName:    "admin",
		PasswordHash: "$argon2id$replacement",
	})
	if err != nil {
		t.Fatalf("BootstrapLocalAdministrator() error = %v", err)
	}
	if created || user != nil {
		t.Fatalf("BootstrapLocalAdministrator() = (%#v, %t), want no change for initialized directory", user, created)
	}
}
