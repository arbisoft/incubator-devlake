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

package grafanausers

import (
	"context"
	"fmt"
	"net/http"
	"net/mail"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/server/api/access"
)

const (
	roleViewer = "Viewer"
	roleEditor = "Editor"
	roleAdmin  = "Admin"

	auditCreate   = "grafana_user.create"
	auditProfile  = "grafana_user.profile"
	auditRole     = "grafana_user.role"
	auditDisable  = "grafana_user.disable"
	auditEnable   = "grafana_user.enable"
	auditPassword = "grafana_user.password"
	auditProjects = "grafana_user.projects"
	auditDelete   = "grafana_user.delete"
	auditOrphan   = "grafana_orphan.clear"
)

// statusMap turns specific Grafana statuses into coded errors for one call.
type statusMap map[int]func() errors.Error

// classify maps a failed Grafana call to a coded error; anything unmapped is unavailable.
func classify(err error, overrides statusMap) errors.Error {
	if requestErr, ok := err.(*requestError); ok {
		if build, found := overrides[requestErr.status]; found {
			return build()
		}
	}
	return unavailableError()
}

func userExistsError() errors.Error {
	return codedError(errors.Conflict, "a Grafana account with this email already exists", ErrCodeUserExists)
}

func userNotFoundError() errors.Error {
	return codedError(errors.NotFound, "Grafana account not found", ErrCodeUserNotFound)
}

func userProtectedError() errors.Error {
	return codedError(errors.Forbidden, "this Grafana account is protected", ErrCodeUserProtected)
}

func ssoManagedError() errors.Error {
	return codedError(errors.Conflict, "this Grafana account is managed by single sign-on", ErrCodeUserSSOManaged)
}

func lastAdminError() errors.Error {
	return codedError(errors.Conflict, "the last enabled Grafana administrator cannot be changed", ErrCodeLastAdmin)
}

func passwordRejectedError() errors.Error {
	return codedError(errors.BadInput, "Grafana rejected the password", ErrCodePasswordBad)
}

func projectMissingError() errors.Error {
	return codedError(errors.BadInput, "unknown project", ErrCodeProjectMissing)
}

func partialError(userID int64) errors.Error {
	return errors.HttpStatus(http.StatusBadGateway).New("the Grafana account was created but setting it up did not finish", errors.WithData(partialData{userID: userID}))
}

func (s *Service) configured() errors.Error {
	if s == nil || s.client == nil {
		return notConfiguredError()
	}
	return nil
}

func (s *Service) record(actor, action, targetEmail, detail string) {
	if s.audit != nil {
		s.audit.RecordAuditEvent(actor, action, targetEmail, detail)
	}
}

func validRole(role string) bool {
	return role == roleViewer || role == roleEditor || role == roleAdmin
}

func normalizeEmail(raw string) (string, errors.Error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	parsed, err := mail.ParseAddress(email)
	if email == "" || err != nil || parsed.Address != email {
		return "", errors.BadInput.New("a valid email is required")
	}
	return email, nil
}

func normalizeName(raw string) (string, errors.Error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", errors.BadInput.New("name is required")
	}
	return name, nil
}

func checkPasswordRule(password string) errors.Error {
	if !utf8.ValidString(password) {
		return errors.BadInput.New("password must be valid UTF-8")
	}
	if utf8.RuneCountInString(password) < passwordMinimumCharacters {
		return codedError(errors.BadInput, fmt.Sprintf("password must be at least %d characters", passwordMinimumCharacters), ErrCodePasswordShort)
	}
	if len(password) > passwordMaximumBytes {
		return errors.BadInput.New(fmt.Sprintf("password must be at most %d bytes", passwordMaximumBytes))
	}
	return nil
}

// validateProjects de-duplicates the names and rejects unknown ones.
func (s *Service) validateProjects(names []string) ([]string, errors.Error) {
	seen := make(map[string]bool, len(names))
	unique := make([]string, 0, len(names))
	for _, name := range names {
		if seen[name] {
			continue
		}
		seen[name] = true
		exists, err := s.mappings.projectExists(name)
		if err != nil {
			return nil, err
		}
		if !exists {
			return nil, projectMissingError()
		}
		unique = append(unique, name)
	}
	return unique, nil
}

func (s *Service) resolveTarget(ctx context.Context, id int64) (*grafanaUser, errors.Error) {
	if id < 1 {
		return nil, errors.BadInput.New("id must be a positive integer")
	}
	user, err := s.client.getUser(ctx, id)
	if err != nil {
		return nil, classify(err, statusMap{http.StatusNotFound: userNotFoundError})
	}
	return user, nil
}

func (s *Service) refuseManagement(target *grafanaUser) errors.Error {
	if s.isManagementLogin(target.Login) {
		return userProtectedError()
	}
	return nil
}

// refuseProtected blocks every write on the management identity and any other server admin.
func (s *Service) refuseProtected(target *grafanaUser) errors.Error {
	if err := s.refuseManagement(target); err != nil {
		return err
	}
	if target.IsGrafanaAdmin {
		return userProtectedError()
	}
	return nil
}

// orgRole returns the user's role in the managed org, or "" when the user is not a member.
func (s *Service) orgRole(ctx context.Context, orgID, userID int64) (string, errors.Error) {
	orgs, err := s.client.userOrgs(ctx, userID)
	if err != nil {
		return "", classify(err, statusMap{http.StatusNotFound: userNotFoundError})
	}
	for _, org := range orgs {
		if org.OrgID == orgID {
			return org.Role, nil
		}
	}
	return "", nil
}

// guardLastAdmin refuses a change that would leave the org without an enabled Admin.
func (s *Service) guardLastAdmin(ctx context.Context, orgID int64, target *grafanaUser, role string) errors.Error {
	if role != roleAdmin || target.IsDisabled {
		return nil
	}
	others, err := s.enabledAdminsOtherThan(ctx, orgID, target.ID)
	if err != nil {
		return err
	}
	if others == 0 {
		return lastAdminError()
	}
	return nil
}

func (s *Service) enabledAdminsOtherThan(ctx context.Context, orgID, userID int64) (int, errors.Error) {
	count, seen := 0, 0
	for page := 1; page <= maxGlobalSearchPages; page++ {
		result, err := s.client.searchOrgUsers(ctx, orgID, "", globalSearchPageSize, page)
		if err != nil {
			return 0, unavailableError()
		}
		for _, user := range result.OrgUsers {
			if user.UserID != userID && user.Role == roleAdmin && !user.IsDisabled {
				count++
			}
		}
		seen += len(result.OrgUsers)
		if len(result.OrgUsers) == 0 || seen >= result.TotalCount {
			break
		}
	}
	return count, nil
}

// userView re-reads an account, its managed-org role and its projects.
func (s *Service) userView(ctx context.Context, orgID, id int64) (*GrafanaUser, errors.Error) {
	user, err := s.resolveTarget(ctx, id)
	if err != nil {
		return nil, err
	}
	role, err := s.orgRole(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	if role == "" {
		role = "None"
	}
	projects, err := s.projectsByLogin([]string{user.Login})
	if err != nil {
		return nil, err
	}
	return &GrafanaUser{
		ID:        user.ID,
		Email:     user.Email,
		Name:      user.Name,
		Role:      role,
		Disabled:  user.IsDisabled,
		SSO:       user.IsExternal || len(user.AuthLabels) > 0,
		Protected: user.IsGrafanaAdmin,
		Projects:  projectsOrEmpty(projects[user.Login]),
	}, nil
}

func auditDetail(user *grafanaUser, change string) string {
	detail := fmt.Sprintf("grafana_id=%d login=%s", user.ID, user.Login)
	if change != "" {
		detail += " " + change
	}
	return detail
}

// CreateUser creates a Grafana account, puts it in the managed org with the role and stores its project access.
func (s *Service) CreateUser(ctx context.Context, admin *access.Principal, actor string, input CreateUserInput) (*GrafanaUser, errors.Error) {
	if err := authorizeAdmin(admin); err != nil {
		return nil, err
	}
	email, err := normalizeEmail(input.Email)
	if err != nil {
		return nil, err
	}
	name, err := normalizeName(input.Name)
	if err != nil {
		return nil, err
	}
	if !validRole(input.Role) {
		return nil, errors.BadInput.New("role must be Viewer, Editor or Admin")
	}
	if err = checkPasswordRule(input.Password); err != nil {
		return nil, err
	}
	if err = s.configured(); err != nil {
		return nil, err
	}
	projects, err := s.validateProjects(input.ProjectNames)
	if err != nil {
		return nil, err
	}
	orgID, err := s.managedOrgID(ctx)
	if err != nil {
		return nil, err
	}
	id, clientErr := s.client.createUser(ctx, name, email, email, input.Password)
	if clientErr != nil {
		return nil, classify(clientErr, statusMap{
			http.StatusPreconditionFailed: userExistsError,
			http.StatusBadRequest:         passwordRejectedError,
		})
	}
	detail := fmt.Sprintf("grafana_id=%d login=%s role=%s projects=%s", id, email, input.Role, strings.Join(projects, ","))
	if err = s.finishCreate(ctx, orgID, id, email, input.Role, projects); err != nil {
		s.record(actor, auditCreate, email, detail+" partial=true")
		return nil, partialError(id)
	}
	s.record(actor, auditCreate, email, detail)
	view, err := s.userView(ctx, orgID, id)
	if err != nil {
		return nil, partialError(id)
	}
	return view, nil
}

func (s *Service) finishCreate(ctx context.Context, orgID, id int64, email, role string, projects []string) errors.Error {
	current, err := s.orgRole(ctx, orgID, id)
	if err != nil {
		return err
	}
	if current == "" {
		if clientErr := s.client.addOrgUser(ctx, orgID, email, role); clientErr != nil {
			return unavailableError()
		}
	} else if current != role {
		if clientErr := s.client.setOrgRole(ctx, orgID, id, role); clientErr != nil {
			return unavailableError()
		}
	}
	return s.mappings.replaceMappings(email, projects)
}

// PatchUser applies the name, email, role and disabled changes that were sent and differ.
func (s *Service) PatchUser(ctx context.Context, admin *access.Principal, actor string, id int64, input PatchUserInput) (*GrafanaUser, errors.Error) {
	if err := authorizeAdmin(admin); err != nil {
		return nil, err
	}
	if input.Name == nil && input.Email == nil && input.Role == nil && input.Disabled == nil {
		return nil, errors.BadInput.New("nothing to update")
	}
	var name, email string
	var err errors.Error
	if input.Name != nil {
		if name, err = normalizeName(*input.Name); err != nil {
			return nil, err
		}
	}
	if input.Email != nil {
		if email, err = normalizeEmail(*input.Email); err != nil {
			return nil, err
		}
	}
	if input.Role != nil && !validRole(*input.Role) {
		return nil, errors.BadInput.New("role must be Viewer, Editor or Admin")
	}
	if err = s.configured(); err != nil {
		return nil, err
	}
	orgID, err := s.managedOrgID(ctx)
	if err != nil {
		return nil, err
	}
	target, err := s.resolveTarget(ctx, id)
	if err != nil {
		return nil, err
	}
	if err = s.refuseManagement(target); err != nil {
		return nil, err
	}

	profileChange := (input.Name != nil && name != target.Name) ||
		(input.Email != nil && (email != target.Email || email != target.Login))
	roleChange, disableChange := false, false
	currentRole := ""
	if input.Role != nil || input.Disabled != nil {
		if currentRole, err = s.orgRole(ctx, orgID, id); err != nil {
			return nil, err
		}
	}
	if input.Role != nil && *input.Role != currentRole {
		roleChange = true
	}
	if input.Disabled != nil && *input.Disabled != target.IsDisabled {
		disableChange = true
	}
	if profileChange || roleChange || disableChange {
		if err = s.refuseProtected(target); err != nil {
			return nil, err
		}
	}
	if profileChange && target.IsExternal {
		return nil, ssoManagedError()
	}
	if roleChange {
		if err = s.guardLastAdmin(ctx, orgID, target, currentRole); err != nil {
			return nil, err
		}
	}
	if disableChange && *input.Disabled {
		if err = s.guardLastAdmin(ctx, orgID, target, currentRole); err != nil {
			return nil, err
		}
	}

	// A failure after an earlier step succeeded returns that error and leaves the earlier step applied.
	if profileChange {
		if err = s.applyProfile(ctx, actor, target, input, name, email); err != nil {
			return nil, err
		}
	}
	if roleChange {
		if err = s.applyRole(ctx, actor, orgID, target, currentRole, *input.Role); err != nil {
			return nil, err
		}
	}
	if disableChange {
		if err = s.applyDisabled(ctx, actor, target, *input.Disabled); err != nil {
			return nil, err
		}
	}
	return s.userView(ctx, orgID, id)
}

func (s *Service) applyProfile(ctx context.Context, actor string, target *grafanaUser, input PatchUserInput, name, email string) errors.Error {
	newName, newEmail, newLogin := target.Name, target.Email, target.Login
	if input.Name != nil {
		newName = name
	}
	if input.Email != nil {
		newEmail, newLogin = email, email
	}
	update := func() errors.Error {
		if err := s.client.updateProfile(ctx, target.ID, newName, newEmail, newLogin); err != nil {
			return classify(err, statusMap{
				http.StatusPreconditionFailed: userExistsError,
				http.StatusForbidden:          ssoManagedError,
				http.StatusNotFound:           userNotFoundError,
			})
		}
		return nil
	}
	changes := []string{}
	if newName != target.Name {
		changes = append(changes, fmt.Sprintf("name=%s->%s", target.Name, newName))
	}
	if newLogin != target.Login {
		dropped, err := s.mappings.moveMappings(target.Login, newLogin, update)
		if err != nil {
			return err
		}
		changes = append(changes, fmt.Sprintf("email=%s->%s dropped_rows=%d", target.Email, newEmail, dropped))
	} else {
		if err := update(); err != nil {
			return err
		}
		if newEmail != target.Email {
			changes = append(changes, fmt.Sprintf("email=%s->%s dropped_rows=0", target.Email, newEmail))
		}
	}
	s.record(actor, auditProfile, newEmail, auditDetail(&grafanaUser{ID: target.ID, Login: newLogin}, strings.Join(changes, " ")))
	target.Name, target.Email, target.Login = newName, newEmail, newLogin
	return nil
}

func (s *Service) applyRole(ctx context.Context, actor string, orgID int64, target *grafanaUser, current, role string) errors.Error {
	var clientErr error
	if current == "" {
		clientErr = s.client.addOrgUser(ctx, orgID, target.Login, role)
	} else {
		clientErr = s.client.setOrgRole(ctx, orgID, target.ID, role)
	}
	if clientErr != nil {
		return classify(clientErr, statusMap{http.StatusNotFound: userNotFoundError})
	}
	before := current
	if before == "" {
		before = "None"
	}
	s.record(actor, auditRole, target.Email, auditDetail(target, fmt.Sprintf("role=%s->%s", before, role)))
	return nil
}

func (s *Service) applyDisabled(ctx context.Context, actor string, target *grafanaUser, disabled bool) errors.Error {
	if err := s.client.setDisabled(ctx, target.ID, disabled); err != nil {
		return classify(err, statusMap{http.StatusNotFound: userNotFoundError})
	}
	action := auditEnable
	if disabled {
		action = auditDisable
	}
	s.record(actor, action, target.Email, auditDetail(target, ""))
	return nil
}

// SetUserProjects replaces the projects the account can see.
func (s *Service) SetUserProjects(ctx context.Context, admin *access.Principal, actor string, id int64, input ProjectsInput) (*GrafanaUser, errors.Error) {
	if err := authorizeAdmin(admin); err != nil {
		return nil, err
	}
	if input.ProjectNames == nil {
		return nil, errors.BadInput.New("projectNames is required")
	}
	if err := s.configured(); err != nil {
		return nil, err
	}
	projects, err := s.validateProjects(input.ProjectNames)
	if err != nil {
		return nil, err
	}
	orgID, err := s.managedOrgID(ctx)
	if err != nil {
		return nil, err
	}
	target, err := s.resolveTarget(ctx, id)
	if err != nil {
		return nil, err
	}
	if err = s.refuseManagement(target); err != nil {
		return nil, err
	}
	before, err := s.projectsByLogin([]string{target.Login})
	if err != nil {
		return nil, err
	}
	if err = s.mappings.replaceMappings(target.Login, projects); err != nil {
		return nil, err
	}
	s.record(actor, auditProjects, target.Email, auditDetail(target, projectsDiff(before[target.Login], projects)))
	return s.userView(ctx, orgID, id)
}

func projectsDiff(before, after []string) string {
	was, now := map[string]bool{}, map[string]bool{}
	for _, name := range before {
		was[name] = true
	}
	for _, name := range after {
		now[name] = true
	}
	var added, removed []string
	for name := range now {
		if !was[name] {
			added = append(added, name)
		}
	}
	for name := range was {
		if !now[name] {
			removed = append(removed, name)
		}
	}
	sort.Strings(added)
	sort.Strings(removed)
	return fmt.Sprintf("projects +%s -%s", strings.Join(added, ","), strings.Join(removed, ","))
}

// SetUserPassword sets a new password on a local (non-SSO) account.
func (s *Service) SetUserPassword(ctx context.Context, admin *access.Principal, actor string, id int64, input PasswordInput) errors.Error {
	if err := authorizeAdmin(admin); err != nil {
		return err
	}
	if err := s.configured(); err != nil {
		return err
	}
	target, err := s.resolveTarget(ctx, id)
	if err != nil {
		return err
	}
	if err = s.refuseProtected(target); err != nil {
		return err
	}
	if target.IsExternal {
		return ssoManagedError()
	}
	if err = checkPasswordRule(input.Password); err != nil {
		return err
	}
	if clientErr := s.client.setPassword(ctx, id, input.Password); clientErr != nil {
		return classify(clientErr, statusMap{
			http.StatusBadRequest: passwordRejectedError,
			http.StatusNotFound:   userNotFoundError,
		})
	}
	s.record(actor, auditPassword, target.Email, auditDetail(target, ""))
	return nil
}

// DeleteUser deletes the Grafana account and its project access together.
func (s *Service) DeleteUser(ctx context.Context, admin *access.Principal, actor string, id int64) errors.Error {
	if err := authorizeAdmin(admin); err != nil {
		return err
	}
	if err := s.configured(); err != nil {
		return err
	}
	orgID, err := s.managedOrgID(ctx)
	if err != nil {
		return err
	}
	target, err := s.resolveTarget(ctx, id)
	if err != nil {
		return err
	}
	if err = s.refuseProtected(target); err != nil {
		return err
	}
	role, err := s.orgRole(ctx, orgID, id)
	if err != nil {
		return err
	}
	if err = s.guardLastAdmin(ctx, orgID, target, role); err != nil {
		return err
	}
	err = s.mappings.deleteMappings(target.Login, func() errors.Error {
		clientErr := s.client.deleteUser(ctx, id)
		if clientErr == nil {
			return nil
		}
		// Already gone between the read and the delete counts as deleted.
		if requestErr, ok := clientErr.(*requestError); ok && requestErr.status == http.StatusNotFound {
			return nil
		}
		return unavailableError()
	})
	if err != nil {
		return err
	}
	s.record(actor, auditDelete, target.Email, auditDetail(target, ""))
	return nil
}

// ClearOrphan removes the stored project access of a key that has no Grafana account.
func (s *Service) ClearOrphan(ctx context.Context, admin *access.Principal, actor, account string) errors.Error {
	if err := authorizeAdmin(admin); err != nil {
		return err
	}
	if account == "" {
		return errors.BadInput.New("account is required")
	}
	if err := s.configured(); err != nil {
		return err
	}
	found, clientErr := s.client.lookupUser(ctx, account)
	if clientErr != nil {
		if requestErr, ok := clientErr.(*requestError); !ok || requestErr.status != http.StatusNotFound {
			return unavailableError()
		}
	} else if found.Login == account {
		return userExistsError()
	}
	if err := s.mappings.deleteMappings(account, nil); err != nil {
		return err
	}
	s.record(actor, auditOrphan, account, "account="+account)
	return nil
}
