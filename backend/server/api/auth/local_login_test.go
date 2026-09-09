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

package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/mock"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/oidchelper"
	"github.com/apache/incubator-devlake/impls/logruslog"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/server/api/access"
)

type testLocalDirectory struct {
	testAccessAuthorizer
	localUserID uint64
	credential  *access.LocalCredential
	user        *access.AccessUser
	replaced    bool
}

func (d *testLocalDirectory) BootstrapLocalAdministrator(access.LocalBootstrapInput) (*access.AccessUser, bool, errors.Error) {
	return nil, false, nil
}

func (d *testLocalDirectory) ResolveActiveLocalCredential(string) (*access.LocalCredential, *access.AccessUser, errors.Error) {
	if d.credential == nil || d.user == nil {
		return nil, nil, errors.NotFound.New("local credential not found")
	}
	return d.credential, d.user, nil
}

func (d *testLocalDirectory) ResolveActiveLocalCredentialByUserID(uint64) (*access.LocalCredential, *access.AccessUser, errors.Error) {
	if d.credential == nil || d.user == nil {
		return nil, nil, errors.NotFound.New("local credential not found")
	}
	return d.credential, d.user, nil
}

func (d *testLocalDirectory) AuthorizeLocalSession(userID uint64) (*access.Principal, errors.Error) {
	if userID != d.localUserID {
		return nil, errors.Unauthorized.New("unexpected local user")
	}
	return &access.Principal{UserID: userID, Role: access.RoleCustomerAdmin}, nil
}

func (d *testLocalDirectory) RefreshLocalPasswordHash(uint64, string) errors.Error { return nil }

func (d *testLocalDirectory) ReplaceLocalPassword(uint64, string) (*access.AccessUser, []string, errors.Error) {
	d.replaced = true
	return d.user, nil, nil
}

func newTestLocalRuntime(t *testing.T) *localAuthRuntime {
	t.Helper()
	runtime, err := newLocalAuthRuntime(&localAuthConfig{
		Enabled:      true,
		RateLimitKey: []byte("local-rate-limit-key-with-at-least-32-bytes"),
	})
	if err != nil {
		t.Fatalf("newLocalAuthRuntime: %v", err)
	}
	return runtime
}

func TestLocalSessionAdmissionAndForcedChangeBoundary(t *testing.T) {
	idp := newFakeIdP(t)
	service, _ := newTestService(t, idp)
	directory := &testLocalDirectory{localUserID: 42}
	service.access = directory
	service.local = newTestLocalRuntime(t)
	router := newTestRouter(service)
	router.GET("/protected", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	session, _, err := oidchelper.IssueSessionWithOptions(service.runtimeCfg, "local-session", localSessionProvider, "42", "", "Local Admin", oidchelper.SessionOptions{MustChangePassword: true})
	if err != nil {
		t.Fatalf("IssueSessionWithOptions: %v", err)
	}

	protected := httptest.NewRecorder()
	protectedRequest := httptest.NewRequest(http.MethodGet, "/protected", nil)
	protectedRequest.AddCookie(&http.Cookie{Name: oidchelper.SessionCookieName, Value: session})
	router.ServeHTTP(protected, protectedRequest)
	if protected.Code != http.StatusForbidden {
		t.Fatalf("forced local session protected status = %d, want %d", protected.Code, http.StatusForbidden)
	}

	userinfo := httptest.NewRecorder()
	userinfoRequest := httptest.NewRequest(http.MethodGet, PathUserInfo, nil)
	userinfoRequest.AddCookie(&http.Cookie{Name: oidchelper.SessionCookieName, Value: session})
	router.ServeHTTP(userinfo, userinfoRequest)
	if userinfo.Code != http.StatusOK {
		t.Fatalf("userinfo status = %d, want %d", userinfo.Code, http.StatusOK)
	}
	response := userInfoResponse{}
	if err := json.Unmarshal(userinfo.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode userinfo: %v", err)
	}
	if !response.Authenticated || !response.MustChangePassword || response.AuthenticationMethod != "local" {
		t.Fatalf("userinfo = %#v, want authenticated forced-change local user", response)
	}
}

func TestLocalLoginIssuesSharedBrowserSessionAndCookies(t *testing.T) {
	hasher, err := newLocalPasswordHasher(defaultLocalPasswordHashConfig())
	if err != nil {
		t.Fatalf("newLocalPasswordHasher: %v", err)
	}
	password := "a secure local login password"
	passwordHash, err := hasher.Hash(password)
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	directory := &testLocalDirectory{
		localUserID: 42,
		credential:  &access.LocalCredential{AccessUserID: 42, LoginName: "admin", PasswordHash: passwordHash},
		user:        &access.AccessUser{Email: "", DisplayName: "Local Admin", Role: access.RoleCustomerAdmin, Status: access.StatusActive},
	}
	directory.user.ID = 42

	db := dalmocks.NewDal(t)
	tx := dalmocks.NewTransaction(t)
	db.EXPECT().Begin().Return(tx).Twice()
	tx.On("CreateIfNotExist", mock.Anything).Return(nil).Times(4)
	tx.On("First", mock.Anything, mock.Anything, mock.Anything).Return(nil).Times(4)
	tx.On("Create", mock.Anything).Return(nil).Once()
	tx.On("Update", mock.Anything).Return(nil).Times(4)
	tx.On("Commit").Return(nil).Twice()

	cfg := &oidchelper.Config{
		AuthEnabled:   true,
		SessionSecret: []byte("test-secret-with-at-least-32-bytes!"),
		SessionTTL:    time.Hour,
		CookieSecure:  false,
	}
	service := &Service{
		runtimeCfg: cfg,
		db:         db,
		logger:     logruslog.Global,
		revoked:    newRevocationCache(),
		lastSeen:   map[string]time.Time{},
		access:     directory,
		local:      &localAuthRuntime{hasher: hasher, throttle: newTestLocalRuntime(t).throttle},
	}
	router := newTestRouter(service)
	payload, err := json.Marshal(localLoginInput{LoginName: "admin", Password: password, ReturnURL: "/connections"})
	if err != nil {
		t.Fatalf("marshal login: %v", err)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, PathLocalLogin, bytes.NewReader(payload)))
	if response.Code != http.StatusSeeOther {
		t.Fatalf("local login status = %d, want %d: %s", response.Code, http.StatusSeeOther, response.Body.String())
	}
	if response.Header().Get("Location") != "/connections" {
		t.Fatalf("local login redirect = %q, want /connections", response.Header().Get("Location"))
	}
	if cookie := extractCookie(t, response.Result(), oidchelper.SessionCookieName); cookie.Value == "" {
		t.Fatal("local login did not set a session cookie")
	}
	if cookie := extractCookie(t, response.Result(), oidchelper.CSRFCookieName); cookie.Value == "" {
		t.Fatal("local login did not set a CSRF cookie")
	}
}

func TestLocalSessionIsRejectedWhenLocalAuthIsDisabled(t *testing.T) {
	idp := newFakeIdP(t)
	service, _ := newTestService(t, idp)
	router := newTestRouter(service)
	session, _, err := oidchelper.IssueSession(service.runtimeCfg, "forged-local-session", localSessionProvider, "42", "", "Local Admin")
	if err != nil {
		t.Fatalf("IssueSession: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, PathUserInfo, nil)
	request.AddCookie(&http.Cookie{Name: oidchelper.SessionCookieName, Value: session})
	router.ServeHTTP(response, request)
	decoded := userInfoResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("decode userinfo: %v", err)
	}
	if decoded.Authenticated {
		t.Fatal("expected local session to be rejected while local auth is disabled")
	}
}

func TestForcedLocalPasswordChangeIssuesNormalSession(t *testing.T) {
	hasher, err := newLocalPasswordHasher(defaultLocalPasswordHashConfig())
	if err != nil {
		t.Fatalf("newLocalPasswordHasher: %v", err)
	}
	directory := &testLocalDirectory{
		localUserID: 42,
		credential:  &access.LocalCredential{AccessUserID: 42, LoginName: "admin", PasswordHash: mustHashLocalPassword(t, hasher, "a secure temporary password")},
		user:        &access.AccessUser{DisplayName: "Local Admin", Role: access.RoleCustomerAdmin, Status: access.StatusActive},
	}
	directory.user.ID = 42
	db := dalmocks.NewDal(t)
	db.On("Create", mock.Anything).Return(nil).Once()
	db.On("UpdateColumn", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)
	cfg := &oidchelper.Config{AuthEnabled: true, SessionSecret: []byte("test-secret-with-at-least-32-bytes!"), SessionTTL: time.Hour, CookieSecure: false}
	service := &Service{runtimeCfg: cfg, db: db, logger: logruslog.Global, revoked: newRevocationCache(), lastSeen: map[string]time.Time{}, access: directory, local: &localAuthRuntime{hasher: hasher, throttle: newTestLocalRuntime(t).throttle}}
	router := newTestRouter(service)
	temporarySession, _, err := oidchelper.IssueSessionWithOptions(cfg, "temporary-session", localSessionProvider, "42", "", "Local Admin", oidchelper.SessionOptions{MustChangePassword: true})
	if err != nil {
		t.Fatalf("IssueSessionWithOptions: %v", err)
	}
	payload, err := json.Marshal(localPasswordChangeInput{Password: "a new secure local password"})
	if err != nil {
		t.Fatalf("marshal change password: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, PathLocalChangePassword, bytes.NewReader(payload))
	request.AddCookie(&http.Cookie{Name: oidchelper.SessionCookieName, Value: temporarySession})
	request.AddCookie(&http.Cookie{Name: oidchelper.CSRFCookieName, Value: "csrf-token"})
	request.Header.Set(oidchelper.CSRFHeaderName, "csrf-token")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("forced password change status = %d, want %d: %s", response.Code, http.StatusNoContent, response.Body.String())
	}
	if !directory.replaced {
		t.Fatal("forced password change did not replace the local credential")
	}
	sessionCookie := extractCookie(t, response.Result(), oidchelper.SessionCookieName)
	claims, err := oidchelper.ParseSession(cfg.SessionSecret, sessionCookie.Value)
	if err != nil {
		t.Fatalf("parse replacement session: %v", err)
	}
	if claims.MustChangePassword {
		t.Fatal("replacement session unexpectedly requires a password change")
	}
}

func TestMethodsAdvertiseLocalPasswordWithoutCredentialDetails(t *testing.T) {
	idp := newFakeIdP(t)
	service, _ := newTestService(t, idp)
	service.local = newTestLocalRuntime(t)
	router := newTestRouter(service)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, PathMethods, nil))
	if response.Code != http.StatusOK {
		t.Fatalf("methods status = %d, want %d", response.Code, http.StatusOK)
	}
	if !strings.Contains(response.Body.String(), PathLocalLogin) || strings.Contains(response.Body.String(), "loginName") {
		t.Fatalf("methods response unexpectedly exposed credential details: %s", response.Body.String())
	}
}

func mustHashLocalPassword(t *testing.T, hasher *localPasswordHasher, password string) string {
	t.Helper()
	hash, err := hasher.Hash(password)
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	return hash
}
