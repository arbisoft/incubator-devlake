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
	"fmt"
	"net/mail"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
)

const identityContextKey = "devlake_access_identity"
const invitationSubjectPrefix = "email:"

type Config struct {
	Enabled             bool
	BootstrapAdminEmail string
}

// SessionRevoker persists revocations in the same transaction as an access-user
// disable. It returns the affected session IDs so the auth service can update its
// in-memory cache only after the transaction commits.
type SessionRevoker interface {
	RevokePersistentSessions(tx dal.Transaction, issuer, subject string) ([]string, errors.Error)
	CacheRevokedSessions(ids []string)
}

type Service struct {
	cfg            Config
	db             dal.Dal
	logger         log.Logger
	sessionRevoker SessionRevoker
}

var (
	defaultService *Service
	initOnce       sync.Once
)

func Init(basicRes context.BasicRes) {
	initOnce.Do(func() {
		cfg := basicRes.GetConfigReader()
		defaultService = &Service{
			cfg: Config{
				Enabled:             cfg.GetBool("AUTH_ACCESS_ENABLED"),
				BootstrapAdminEmail: normalizeEmail(cfg.GetString("AUTH_BOOTSTRAP_ADMIN_EMAIL")),
			},
			db:     basicRes.GetDal(),
			logger: basicRes.GetLogger(),
		}
	})
}

func Default() *Service { return defaultService }

func SetSessionRevoker(revoker SessionRevoker) {
	if defaultService != nil {
		defaultService.sessionRevoker = revoker
	}
}

func (s *Service) Enabled() bool { return s != nil && s.cfg.Enabled }

// ValidateConfiguration rejects the legacy trusted-proxy identity path when
// the access directory is enabled, because that path does not consult the
// directory before authenticating a request.
func ValidateConfiguration(forwardedUserSecret string) error {
	if strings.TrimSpace(forwardedUserSecret) == "" {
		return nil
	}
	return fmt.Errorf("AUTH_ACCESS_ENABLED=true cannot be combined with FORWARDED_USER_SECRET; remove trusted oauth2-proxy forwarded identity authentication before enabling the access directory")
}

func SetIdentity(c *gin.Context, identity Identity) { c.Set(identityContextKey, identity) }

func GetIdentity(c *gin.Context) (Identity, bool) {
	value, ok := c.Get(identityContextKey)
	if !ok {
		return Identity{}, false
	}
	identity, ok := value.(Identity)
	return identity, ok
}

// Authorize accepts only a verified OIDC identity. It is invoked before a
// DevLake session is issued, so denied identities never receive a cookie.
func (s *Service) Authorize(identity Identity) (*Principal, errors.Error) {
	if !s.Enabled() {
		return &Principal{}, nil
	}
	identity.Email = normalizeEmail(identity.Email)
	if identity.Issuer == "" || identity.Subject == "" || identity.Email == "" {
		return nil, errors.Unauthorized.New("verified OIDC identity is incomplete")
	}

	user := &AccessUser{}
	err := s.db.First(user, dal.Where("issuer = ? AND subject = ?", identity.Issuer, identity.Subject))
	if err == nil {
		return s.authorizeExistingUser(user, identity)
	}
	if !s.db.IsErrorNotFound(err) {
		return nil, errors.Default.Wrap(err, "error looking up access user")
	}
	invitation, invitationFound, invitationErr := s.claimInvitation(identity)
	if invitationErr != nil {
		return nil, invitationErr
	}
	if invitationFound {
		s.audit("", "user.invitation_claimed", invitation, "")
		return s.authorizeExistingUser(invitation, identity)
	}

	if principal, bootstrapErr := s.bootstrap(identity); bootstrapErr != nil || principal != nil {
		return principal, bootstrapErr
	}

	domain, ok := emailDomain(identity.Email)
	if !ok {
		return nil, errors.Unauthorized.New("verified email is invalid")
	}
	accessDomain := &AccessDomain{}
	err = s.db.First(accessDomain, dal.Where("domain = ? AND hidden_at IS NULL", domain))
	if err == nil && accessDomain.Status == StatusActive {
		user = &AccessUser{
			Issuer: identity.Issuer, Subject: identity.Subject, Email: identity.Email,
			DisplayName: identity.DisplayName, Role: accessDomain.DefaultRole, Status: StatusActive,
		}
		if createErr := s.db.Create(user); createErr != nil {
			if s.db.IsDuplicationError(createErr) {
				return s.Authorize(identity)
			}
			return nil, errors.Default.Wrap(createErr, "error creating domain-authorized user")
		}
		s.audit("", "user.domain_provisioned", user, "")
		return &Principal{UserID: user.ID, Role: user.Role}, nil
	}
	if err != nil && !s.db.IsErrorNotFound(err) {
		return nil, errors.Default.Wrap(err, "error looking up access domain")
	}
	return nil, errors.Unauthorized.New("this account is not allowed to access DevLake")
}

func (s *Service) bootstrap(identity Identity) (*Principal, errors.Error) {
	if s.cfg.BootstrapAdminEmail == "" || identity.Email != s.cfg.BootstrapAdminEmail {
		return nil, nil
	}
	tx := s.db.Begin()
	finished := false
	defer func() {
		if !finished {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback bootstrap administrator claim")
			}
		}
	}()

	count, err := tx.Count(dal.From(&AccessUser{}))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error checking access bootstrap state")
	}
	if count != 0 {
		return nil, nil
	}
	if err := tx.Create(&BootstrapClaim{Key: bootstrapClaimKey}); err != nil {
		if tx.IsDuplicationError(err) {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				return nil, errors.Default.Wrap(rollbackErr, "error rolling back bootstrap administrator claim")
			}
			finished = true
			existing := &AccessUser{}
			if lookupErr := s.db.First(existing, dal.Where("issuer = ? AND subject = ?", identity.Issuer, identity.Subject)); lookupErr == nil {
				return s.authorizeExistingUser(existing, identity)
			} else if !s.db.IsErrorNotFound(lookupErr) {
				return nil, errors.Default.Wrap(lookupErr, "error reading bootstrap administrator")
			}
			return nil, errors.Unauthorized.New("the bootstrap administrator has already been claimed")
		}
		return nil, errors.Default.Wrap(err, "error claiming bootstrap administrator")
	}
	now := time.Now()
	user := &AccessUser{
		Issuer: identity.Issuer, Subject: identity.Subject, Email: identity.Email,
		DisplayName: identity.DisplayName, Role: RoleCustomerAdmin, Status: StatusActive, LastLoginAt: &now,
	}
	if err := tx.Create(user); err != nil {
		return nil, errors.Default.Wrap(err, "error creating bootstrap administrator")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing bootstrap administrator")
	}
	finished = true
	s.audit(identity.Email, "bootstrap.consumed", user, "")
	s.logger.Info("access: bootstrap administrator provisioned email=%s", identity.Email)
	return &Principal{UserID: user.ID, Role: user.Role}, nil
}

// claimInvitation conditionally binds an email invitation to the verified OIDC
// identity. A concurrent claimant can update only an unclaimed row; the final
// read authorizes the winner and rejects every other identity.
func (s *Service) claimInvitation(identity Identity) (*AccessUser, bool, errors.Error) {
	tx := s.db.Begin()
	finished := false
	defer func() {
		if !finished {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback invitation claim email=%s", identity.Email)
			}
		}
	}()

	invitation := &AccessUser{}
	err := tx.First(invitation, dal.Where("issuer = ? AND subject = ? AND hidden_at IS NULL", "", invitationSubject(identity.Email)))
	if err != nil {
		if tx.IsErrorNotFound(err) {
			return nil, false, nil
		}
		return nil, false, errors.Default.Wrap(err, "error looking up invited access user")
	}
	now := time.Now()
	if err := tx.UpdateColumns(
		&AccessUser{},
		[]dal.DalSet{
			{ColumnName: "issuer", Value: identity.Issuer},
			{ColumnName: "subject", Value: identity.Subject},
			{ColumnName: "email", Value: identity.Email},
			{ColumnName: "display_name", Value: identity.DisplayName},
			{ColumnName: "last_login_at", Value: now},
		},
		dal.Where("id = ? AND issuer = ? AND subject = ?", invitation.ID, "", invitationSubject(identity.Email)),
	); err != nil {
		return nil, false, errors.Default.Wrap(err, "error claiming invited access user")
	}
	if err := tx.Commit(); err != nil {
		return nil, false, errors.Default.Wrap(err, "error committing invited access user claim")
	}
	finished = true

	claimed := &AccessUser{}
	if err := s.db.First(claimed, dal.Where("id = ?", invitation.ID)); err != nil {
		return nil, false, errors.Default.Wrap(err, "error reading claimed access user")
	}
	if claimed.Issuer != identity.Issuer || claimed.Subject != identity.Subject {
		return nil, false, errors.Unauthorized.New("this invitation has already been claimed")
	}
	return claimed, true, nil
}

func (s *Service) authorizeExistingUser(user *AccessUser, identity Identity) (*Principal, errors.Error) {
	if user.HiddenAt != nil || user.Status != StatusActive {
		return nil, errors.Unauthorized.New("this account is disabled")
	}
	now := time.Now()
	user.Email = identity.Email
	user.DisplayName = identity.DisplayName
	user.LastLoginAt = &now
	if err := s.db.Update(user); err != nil {
		return nil, errors.Default.Wrap(err, "error recording access user login")
	}
	return &Principal{UserID: user.ID, Role: user.Role}, nil
}

func (s *Service) CurrentPrincipal(c *gin.Context) (*Principal, errors.Error) {
	if !s.Enabled() {
		return nil, errors.HttpStatus(404).New("access management is not enabled")
	}
	identity, ok := GetIdentity(c)
	if !ok {
		return nil, errors.Unauthorized.New("native OIDC authentication is required")
	}
	return s.AuthorizeSession(identity)
}

// AuthorizeSession validates a previously issued native OIDC session against the
// current access directory without updating login metadata on every request.
func (s *Service) AuthorizeSession(identity Identity) (*Principal, errors.Error) {
	if !s.Enabled() {
		return &Principal{}, nil
	}
	if identity.Issuer == "" || identity.Subject == "" {
		return nil, errors.Unauthorized.New("native session identity is incomplete")
	}
	user := &AccessUser{}
	err := s.db.First(user, dal.Where("issuer = ? AND subject = ?", identity.Issuer, identity.Subject))
	if err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, errors.Unauthorized.New("this account is not allowed to access DevLake")
		}
		return nil, errors.Default.Wrap(err, "error looking up current access user")
	}
	if user.HiddenAt != nil || user.Status != StatusActive {
		return nil, errors.Unauthorized.New("this account is disabled")
	}
	return &Principal{UserID: user.ID, Role: user.Role}, nil
}

func (s *Service) RequireAdmin(c *gin.Context) (*Principal, errors.Error) {
	principal, err := s.CurrentPrincipal(c)
	if err != nil {
		return nil, err
	}
	if principal.Role != RoleCustomerAdmin {
		return nil, errors.Forbidden.New("customer administrator access is required")
	}
	return principal, nil
}

func (s *Service) ListUsers(query PageQuery) (*PaginatedUsers, errors.Error) {
	query, valid := query.Normalize()
	if !valid {
		return nil, errors.BadInput.New(invalidPageSizeMessage)
	}
	count, err := s.db.Count(dal.From(&AccessUser{}), dal.Where("hidden_at IS NULL"))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error counting access users")
	}
	users := make([]AccessUser, 0)
	if err := s.db.All(&users, dal.Where("hidden_at IS NULL"), dal.Orderby("email ASC"), dal.Offset(query.Offset()), dal.Limit(query.PageSize)); err != nil {
		return nil, errors.Default.Wrap(err, "error listing access users")
	}
	return &PaginatedUsers{Users: users, Count: count, Page: query.Page, PageSize: query.PageSize}, nil
}

func (s *Service) ListDomains(query PageQuery) (*PaginatedDomains, errors.Error) {
	query, valid := query.Normalize()
	if !valid {
		return nil, errors.BadInput.New(invalidPageSizeMessage)
	}
	count, err := s.db.Count(dal.From(&AccessDomain{}), dal.Where("hidden_at IS NULL"))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error counting access domains")
	}
	domains := make([]AccessDomain, 0)
	if err := s.db.All(&domains, dal.Where("hidden_at IS NULL"), dal.Orderby("domain ASC"), dal.Offset(query.Offset()), dal.Limit(query.PageSize)); err != nil {
		return nil, errors.Default.Wrap(err, "error listing access domains")
	}
	return &PaginatedDomains{Domains: domains, Count: count, Page: query.Page, PageSize: query.PageSize}, nil
}

func (s *Service) ListAuditEvents() ([]AuditEvent, errors.Error) {
	events := make([]AuditEvent, 0)
	if err := s.db.All(&events, dal.Orderby("created_at DESC"), dal.Limit(100)); err != nil {
		return nil, errors.Default.Wrap(err, "error listing access audit events")
	}
	return events, nil
}

func (s *Service) CreateDomain(actor string, input AccessDomain) (*AccessDomain, errors.Error) {
	domain := normalizeDomain(input.Domain)
	if !validDomain(domain) || !validRole(input.DefaultRole) {
		return nil, errors.BadInput.New("provide a valid domain and default role")
	}
	existing := &AccessDomain{}
	if err := s.db.First(existing, dal.Where("domain = ?", domain)); err == nil {
		if existing.HiddenAt == nil {
			return nil, errors.BadInput.New("this domain already has a DevLake access policy")
		}
		existing.DefaultRole = input.DefaultRole
		existing.Status = StatusActive
		existing.HiddenAt = nil
		if updateErr := s.db.Update(existing); updateErr != nil {
			return nil, errors.Default.Wrap(updateErr, "error restoring access domain")
		}
		s.audit(actor, "domain.restored", nil, fmt.Sprintf("domain=%s", existing.Domain))
		return existing, nil
	} else if !s.db.IsErrorNotFound(err) {
		return nil, errors.Default.Wrap(err, "error looking up access domain")
	}
	input.Domain = domain
	input.Status = StatusActive
	if err := s.db.Create(&input); err != nil {
		if s.db.IsDuplicationError(err) {
			return nil, errors.BadInput.New("this domain already has a DevLake access policy")
		}
		return nil, errors.Default.Wrap(err, "error creating access domain")
	}
	s.audit(actor, "domain.created", nil, input.Domain)
	return &input, nil
}

func (s *Service) CreateUser(actor, email, role string) (*AccessUser, errors.Error) {
	email = normalizeEmail(email)
	if _, ok := emailDomain(email); !ok || !validRole(role) {
		return nil, errors.BadInput.New("provide a valid email and role")
	}
	visible := &AccessUser{}
	if err := s.db.First(visible, dal.Where("email = ? AND hidden_at IS NULL", email)); err == nil {
		return nil, errors.BadInput.New("this email already has a DevLake access entry")
	} else if !s.db.IsErrorNotFound(err) {
		return nil, errors.Default.Wrap(err, "error looking up access user")
	}
	existing := &AccessUser{}
	if err := s.db.First(existing, dal.Where("email = ? AND hidden_at IS NOT NULL", email)); err == nil {
		existing.Role = role
		existing.Status = StatusActive
		existing.DisabledAt = nil
		existing.HiddenAt = nil
		if updateErr := s.db.Update(existing); updateErr != nil {
			return nil, errors.Default.Wrap(updateErr, "error restoring access user")
		}
		s.audit(actor, "user.restored", existing, "")
		return existing, nil
	} else if !s.db.IsErrorNotFound(err) {
		return nil, errors.Default.Wrap(err, "error looking up access user")
	}
	user := &AccessUser{
		Email: email, Role: role, Status: StatusActive,
		Subject: invitationSubject(email),
	}
	if err := s.db.Create(user); err != nil {
		if s.db.IsDuplicationError(err) {
			return nil, errors.BadInput.New("this email already has a DevLake access entry")
		}
		return nil, errors.Default.Wrap(err, "error creating access user")
	}
	s.audit(actor, "user.invited", user, "")
	return user, nil
}

func (s *Service) UpdateDomain(actor string, id uint64, role, status string) (*AccessDomain, errors.Error) {
	if !validRole(role) || !validStatus(status) {
		return nil, errors.BadInput.New("provide a valid default role and status")
	}
	domain := &AccessDomain{}
	if err := s.db.First(domain, dal.Where("id = ? AND hidden_at IS NULL", id)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, errors.NotFound.New("access domain not found")
		}
		return nil, errors.Default.Wrap(err, "error looking up access domain")
	}
	domain.DefaultRole = role
	domain.Status = status
	if err := s.db.Update(domain); err != nil {
		return nil, errors.Default.Wrap(err, "error updating access domain")
	}
	s.audit(actor, "domain.updated", nil, fmt.Sprintf("domain=%s role=%s status=%s", domain.Domain, role, status))
	return domain, nil
}

func (s *Service) UpdateUser(actor string, id uint64, role, status string) (*AccessUser, errors.Error) {
	return s.updateUser(actor, id, role, status, false)
}

// HideUser retains the user and its audit history but disables the account before
// excluding it from the management UI.
func (s *Service) HideUser(actor string, id uint64) (*AccessUser, errors.Error) {
	return s.updateUser(actor, id, "", StatusDisabled, true)
}

func (s *Service) updateUser(actor string, id uint64, role, status string, hide bool) (*AccessUser, errors.Error) {
	if !hide && (!validRole(role) || !validStatus(status)) {
		return nil, errors.BadInput.New("provide a valid role and status")
	}
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback user change id=%d", id)
			}
		}
	}()

	user := &AccessUser{}
	if err := tx.First(user, dal.Where("id = ? AND hidden_at IS NULL", id)); err != nil {
		if tx.IsErrorNotFound(err) {
			return nil, errors.NotFound.New("access user not found")
		}
		return nil, errors.Default.Wrap(err, "error looking up access user")
	}
	if hide {
		role = user.Role
		status = StatusDisabled
	}
	removesActiveAdmin := user.Role == RoleCustomerAdmin && user.Status == StatusActive && (status == StatusDisabled || role != RoleCustomerAdmin)
	if removesActiveAdmin {
		activeAdmins, err := tx.Count(dal.From(&AccessUser{}), dal.Where("role = ? AND status = ? AND hidden_at IS NULL", RoleCustomerAdmin, StatusActive))
		if err != nil {
			return nil, errors.Default.Wrap(err, "error checking customer administrators")
		}
		if activeAdmins <= 1 {
			return nil, errors.BadInput.New("keep at least one active customer administrator")
		}
	}
	user.Role = role
	user.Status = status
	if status == StatusDisabled {
		now := time.Now()
		user.DisabledAt = &now
	} else {
		user.DisabledAt = nil
	}
	if hide {
		now := time.Now()
		user.HiddenAt = &now
	}
	if err := tx.Update(user); err != nil {
		return nil, errors.Default.Wrap(err, "error saving access user")
	}
	var revokedSessionIDs []string
	if status == StatusDisabled && s.sessionRevoker != nil {
		ids, err := s.sessionRevoker.RevokePersistentSessions(tx, user.Issuer, user.Subject)
		if err != nil {
			s.logger.Error(err, "access: revoke sessions for disabled user id=%d email=%s", user.ID, user.Email)
			return nil, errors.Default.Wrap(err, "error revoking sessions for disabled access user")
		}
		revokedSessionIDs = ids
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing access user change")
	}
	committed = true
	if s.sessionRevoker != nil && len(revokedSessionIDs) > 0 {
		s.sessionRevoker.CacheRevokedSessions(revokedSessionIDs)
	}
	action := "user.updated"
	detail := fmt.Sprintf("role=%s status=%s", role, status)
	if hide {
		action = "user.hidden"
		detail = ""
	}
	s.audit(actor, action, user, detail)
	return user, nil
}

// HideDomain retains the policy and audit history but prevents new domain-based
// user provisioning before excluding it from the management UI.
func (s *Service) HideDomain(actor string, id uint64) (*AccessDomain, errors.Error) {
	domain := &AccessDomain{}
	if err := s.db.First(domain, dal.Where("id = ? AND hidden_at IS NULL", id)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, errors.NotFound.New("access domain not found")
		}
		return nil, errors.Default.Wrap(err, "error looking up access domain")
	}
	now := time.Now()
	domain.Status = StatusDisabled
	domain.HiddenAt = &now
	if err := s.db.Update(domain); err != nil {
		return nil, errors.Default.Wrap(err, "error hiding access domain")
	}
	s.audit(actor, "domain.hidden", nil, fmt.Sprintf("domain=%s", domain.Domain))
	return domain, nil
}

func (s *Service) audit(actor, action string, user *AccessUser, detail string) {
	targetID, targetEmail := uint64(0), ""
	if user != nil {
		targetID, targetEmail = user.ID, user.Email
	}
	if err := s.db.Create(&AuditEvent{ActorEmail: actor, Action: action, TargetID: targetID, TargetEmail: targetEmail, Detail: detail}); err != nil {
		s.logger.Error(err, "access: record audit event actor=%s action=%s target_id=%d target_email=%s", actor, action, targetID, targetEmail)
	}
}

func normalizeEmail(raw string) string { return strings.ToLower(strings.TrimSpace(raw)) }

func invitationSubject(email string) string { return invitationSubjectPrefix + email }

func normalizeDomain(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func validDomain(domain string) bool {
	if domain == "" || strings.ContainsAny(domain, "@ \t\r\n") || strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") || strings.Contains(domain, "..") {
		return false
	}
	parsed, ok := emailDomain("access@" + domain)
	return ok && parsed == domain
}

func emailDomain(email string) (string, bool) {
	parsed, err := mail.ParseAddress(email)
	if err != nil || normalizeEmail(parsed.Address) != email {
		return "", false
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 || parts[1] == "" {
		return "", false
	}
	return normalizeDomain(parts[1]), true
}

func validRole(role string) bool     { return role == RoleCustomerAdmin || role == RoleMember }
func validStatus(status string) bool { return status == StatusActive || status == StatusDisabled }
