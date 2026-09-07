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
	"fmt"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/oidchelper"
	"github.com/apache/incubator-devlake/server/api/access"
	"github.com/apache/incubator-devlake/server/api/shared"
)

type localAuthRuntime struct {
	config    *localAuthConfig
	hasher    *localPasswordHasher
	throttle  *localLoginThrottle
	dummyHash string
}

type localAccessDirectory interface {
	BootstrapLocalAdministrator(input access.LocalBootstrapInput) (*access.AccessUser, bool, errors.Error)
	ResolveActiveLocalCredential(loginName string) (*access.LocalCredential, *access.AccessUser, errors.Error)
	ResolveActiveLocalCredentialByUserID(userID uint64) (*access.LocalCredential, *access.AccessUser, errors.Error)
	AuthorizeLocalSession(userID uint64) (*access.Principal, errors.Error)
	RefreshLocalPasswordHash(userID uint64, passwordHash string) errors.Error
	ReplaceLocalPassword(userID uint64, passwordHash string) (*access.AccessUser, []string, errors.Error)
}

type localLoginInput struct {
	LoginName string `json:"loginName"`
	Password  string `json:"password"`
	ReturnURL string `json:"returnUrl"`
}

type localPasswordChangeInput struct {
	CurrentPassword string `json:"currentPassword"`
	Password        string `json:"password"`
}

type issuedBrowserSession struct {
	JWT  string
	CSRF string
}

func newLocalAuthRuntime(config *localAuthConfig) (*localAuthRuntime, error) {
	if config == nil || !config.Enabled {
		return nil, nil
	}
	hasher, err := newLocalPasswordHasher(defaultLocalPasswordHashConfig())
	if err != nil {
		return nil, err
	}
	throttle, err := newLocalLoginThrottle(config.RateLimitKey)
	if err != nil {
		return nil, err
	}
	dummyHash, err := hasher.Hash("local-password-dummy-value-which-is-not-a-credential")
	if err != nil {
		return nil, fmt.Errorf("create local password dummy hash: %w", err)
	}
	return &localAuthRuntime{config: config, hasher: hasher, throttle: throttle, dummyHash: dummyHash}, nil
}

func (s *Service) bootstrapLocalAdministrator() error {
	if s.local == nil || s.local.config.BootstrapUsername == "" {
		return nil
	}
	directory, ok := s.access.(localAccessDirectory)
	if !ok {
		return fmt.Errorf("local password authentication requires the access directory")
	}
	passwordHash, err := s.local.hasher.Hash(s.local.config.BootstrapPassword)
	if err != nil {
		return fmt.Errorf("hash local bootstrap password: %w", err)
	}
	_, _, bootstrapErr := directory.BootstrapLocalAdministrator(access.LocalBootstrapInput{
		LoginName:    s.local.config.BootstrapUsername,
		PasswordHash: passwordHash,
	})
	return bootstrapErr
}

func (s *Service) localDirectory() (localAccessDirectory, bool) {
	directory, ok := s.access.(localAccessDirectory)
	return directory, ok && s.local != nil
}

func LocalLogin(c *gin.Context) { defaultService.LocalLogin(c) }

// LocalLogin accepts a local username/password and issues the same signed,
// persistent browser session as OIDC. Credential failures deliberately share
// one response so a browser cannot enumerate local accounts.
func (s *Service) LocalLogin(c *gin.Context) {
	directory, ok := s.localDirectory()
	if !ok {
		shared.ApiOutputError(c, errors.HttpStatus(http.StatusServiceUnavailable).New("local password authentication is not enabled"))
		return
	}
	input := localLoginInput{}
	if err := c.ShouldBindJSON(&input); err != nil {
		fail(c, http.StatusBadRequest, "invalid local login request", err)
		return
	}
	loginName, err := normalizeLocalUsername(input.LoginName)
	if err != nil || !validLocalLoginPassword(input.Password) {
		fail(c, http.StatusBadRequest, "invalid local login request", err)
		return
	}
	allowed, throttleErr := s.localLoginAllowed(loginName, c.ClientIP())
	if throttleErr != nil {
		fail(c, http.StatusInternalServerError, "check local login throttle", throttleErr)
		return
	}
	if !allowed {
		localLoginThrottled(c)
		return
	}

	credential, user, lookupErr := directory.ResolveActiveLocalCredential(loginName)
	if lookupErr != nil {
		s.verifyDummyLocalPassword(input.Password)
		s.recordLocalLoginFailure(loginName, c.ClientIP())
		localLoginFailure(c)
		return
	}
	matched, rehash, verifyErr := s.local.hasher.Verify(credential.PasswordHash, input.Password)
	if verifyErr != nil {
		s.logger.Error(verifyErr, "local login credential hash is invalid")
		s.verifyDummyLocalPassword(input.Password)
		s.recordLocalLoginFailure(loginName, c.ClientIP())
		localLoginFailure(c)
		return
	}
	if !matched {
		s.recordLocalLoginFailure(loginName, c.ClientIP())
		localLoginFailure(c)
		return
	}
	principal, accessErr := directory.AuthorizeLocalSession(user.ID)
	if accessErr != nil {
		s.recordLocalLoginFailure(loginName, c.ClientIP())
		localLoginFailure(c)
		return
	}
	if rehash {
		// A successful verification is the only safe point to upgrade a stored
		// PHC value. This must preserve a forced-change requirement.
		passwordHash, hashErr := s.local.hasher.Hash(input.Password)
		if hashErr != nil {
			fail(c, http.StatusInternalServerError, "refresh local credential", hashErr)
			return
		}
		if replaceErr := directory.RefreshLocalPasswordHash(user.ID, passwordHash); replaceErr != nil {
			fail(c, http.StatusInternalServerError, "refresh local credential", replaceErr)
			return
		}
	}
	issued, issueErr := s.issueLocalBrowserSession(loginName, c.ClientIP(), user, credential.MustChangePassword)
	if issueErr != nil {
		fail(c, http.StatusInternalServerError, "issue local session", issueErr)
		return
	}
	issued.setCookies(c, s.Config())
	access.SetPrincipal(c, principal)
	s.logger.Info("local login succeeded user_id=%d", user.ID)
	c.Redirect(http.StatusSeeOther, safeReturnURL(input.ReturnURL))
}

func LocalChangePassword(c *gin.Context) { defaultService.LocalChangePassword(c) }

// LocalChangePassword replaces the current local password. Forced sessions may
// omit the current password because their temporary password was verified at
// sign-in; normal sessions must prove their current password again.
func (s *Service) LocalChangePassword(c *gin.Context) {
	directory, ok := s.localDirectory()
	if !ok {
		shared.ApiOutputError(c, errors.HttpStatus(http.StatusServiceUnavailable).New("local password authentication is not enabled"))
		return
	}
	claims, ok := sessionClaims(c)
	if !ok || claims.Provider != localSessionProvider {
		fail(c, http.StatusUnauthorized, "local session is required", nil)
		return
	}
	userID, err := localSessionUserID(claims.Subject)
	if err != nil {
		fail(c, http.StatusUnauthorized, "local session is invalid", err)
		return
	}
	input := localPasswordChangeInput{}
	if err := c.ShouldBindJSON(&input); err != nil {
		fail(c, http.StatusBadRequest, "invalid local password change request", err)
		return
	}
	if err := validateLocalPassword(input.Password); err != nil {
		fail(c, http.StatusBadRequest, "invalid local password change request", err)
		return
	}
	credential, _, lookupErr := directory.ResolveActiveLocalCredentialByUserID(userID)
	if lookupErr != nil {
		fail(c, http.StatusUnauthorized, "local credential is not available", lookupErr)
		return
	}
	if !claims.MustChangePassword {
		matched, _, verifyErr := s.local.hasher.Verify(credential.PasswordHash, input.CurrentPassword)
		if verifyErr != nil {
			fail(c, http.StatusInternalServerError, "verify local credential", verifyErr)
			return
		}
		if !matched {
			fail(c, http.StatusUnauthorized, "current password is invalid", nil)
			return
		}
	}
	passwordHash, hashErr := s.local.hasher.Hash(input.Password)
	if hashErr != nil {
		fail(c, http.StatusInternalServerError, "hash local password", hashErr)
		return
	}
	user, _, replaceErr := directory.ReplaceLocalPassword(userID, passwordHash)
	if replaceErr != nil {
		fail(c, http.StatusInternalServerError, "change local password", replaceErr)
		return
	}
	issued, issueErr := s.issueBrowserSession(s.db, localSessionProvider, localSessionSubject(user.ID), user.Email, user.DisplayName, false)
	if issueErr != nil {
		fail(c, http.StatusInternalServerError, "issue local session", issueErr)
		return
	}
	issued.setCookies(c, s.Config())
	s.logger.Info("local password changed user_id=%d", user.ID)
	c.Status(http.StatusNoContent)
}

func (s *Service) issueBrowserSession(db dal.Dal, provider, subject, email, name string, mustChangePassword bool) (*issuedBrowserSession, error) {
	cfg := s.Config()
	if cfg == nil {
		return nil, fmt.Errorf("authentication configuration is unavailable")
	}
	jti := uuid.NewString()
	jwt, expiresAt, err := oidchelper.IssueSessionWithOptions(cfg, jti, provider, subject, email, name, oidchelper.SessionOptions{MustChangePassword: mustChangePassword})
	if err != nil {
		return nil, err
	}
	now := time.Now()
	if err := CreateSession(db, &AuthSession{Jti: jti, Provider: provider, Sub: subject, Email: email, Name: name, IssuedAt: now, ExpiresAt: expiresAt, LastSeenAt: now}); err != nil {
		return nil, err
	}
	csrf, err := oidchelper.NewCSRFToken()
	if err != nil {
		return nil, err
	}
	return &issuedBrowserSession{JWT: jwt, CSRF: csrf}, nil
}

func (issued *issuedBrowserSession) setCookies(c *gin.Context, cfg *oidchelper.Config) {
	oidchelper.SetSessionCookie(c, cfg, issued.JWT)
	oidchelper.SetCSRFCookie(c, cfg, issued.CSRF)
}

func (s *Service) localLoginAllowed(loginName, clientIP string) (bool, errors.Error) {
	tx := s.db.Begin()
	allowed, err := s.local.throttle.Allowed(tx, loginName, clientIP)
	if err != nil {
		_ = tx.Rollback()
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, errors.Default.Wrap(err, "commit local login throttle check")
	}
	return allowed, nil
}

func (s *Service) recordLocalLoginFailure(loginName, clientIP string) {
	tx := s.db.Begin()
	if _, err := s.local.throttle.RecordFailure(tx, loginName, clientIP); err != nil {
		_ = tx.Rollback()
		s.logger.Error(err, "local login throttle update failed")
		return
	}
	if err := tx.Commit(); err != nil {
		s.logger.Error(err, "local login throttle update commit failed")
	}
}

func (s *Service) issueLocalBrowserSession(loginName, clientIP string, user *access.AccessUser, mustChangePassword bool) (*issuedBrowserSession, errors.Error) {
	tx := s.db.Begin()
	if err := s.local.throttle.Reset(tx, loginName, clientIP); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	issued, err := s.issueBrowserSession(tx, localSessionProvider, localSessionSubject(user.ID), user.Email, user.DisplayName, mustChangePassword)
	if err != nil {
		_ = tx.Rollback()
		return nil, errors.Default.Wrap(err, "persist local browser session")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "commit local browser session")
	}
	return issued, nil
}

func (s *Service) verifyDummyLocalPassword(password string) {
	_, _, _ = s.local.hasher.Verify(s.local.dummyHash, password)
}

func validLocalLoginPassword(password string) bool {
	return len(password) <= localPasswordMaximumBytes && utf8.ValidString(password)
}

func localLoginFailure(c *gin.Context) {
	shared.ApiOutputError(c, errors.HttpStatus(http.StatusUnauthorized).New("invalid username or password"))
}

func localLoginThrottled(c *gin.Context) {
	shared.ApiOutputError(c, errors.HttpStatus(http.StatusTooManyRequests).New("too many login attempts"))
}
