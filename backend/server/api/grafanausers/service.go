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

// Package grafanausers lets a DevLake customer administrator manage Grafana accounts and their project access.
package grafanausers

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"sync"

	basecontext "github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/server/api/access"
	"github.com/apache/incubator-devlake/server/services"
)

// mappingStore is the slice of user_project_mapping access this package needs.
type mappingStore interface {
	mappingsForLogins(logins []string) ([]*models.UserProjectMapping, errors.Error)
	mappingLogins() ([]string, errors.Error)
	projectExists(name string) (bool, errors.Error)
	replaceMappings(login string, projectNames []string) errors.Error
	moveMappings(oldLogin, newLogin string, during func() errors.Error) (int64, errors.Error)
	deleteMappings(login string, during func() errors.Error) errors.Error
}

// auditRecorder is the slice of the access audit log this package writes to.
type auditRecorder interface {
	RecordAuditEvent(actor, action, targetEmail, detail string)
}

type dbMappingStore struct{}

func (dbMappingStore) mappingsForLogins(logins []string) ([]*models.UserProjectMapping, errors.Error) {
	return services.GetUserProjectMappingsForLogins(logins)
}

func (dbMappingStore) mappingLogins() ([]string, errors.Error) {
	return services.GetUserProjectMappingLogins()
}

func (dbMappingStore) projectExists(name string) (bool, errors.Error) {
	if name == "" {
		return false, nil
	}
	if _, err := services.GetProject(name); err != nil {
		if err.GetType().GetHttpCode() == http.StatusNotFound {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (dbMappingStore) replaceMappings(login string, projectNames []string) errors.Error {
	return services.ReplaceUserProjectMappings(login, projectNames)
}

func (dbMappingStore) moveMappings(oldLogin, newLogin string, during func() errors.Error) (int64, errors.Error) {
	return services.MoveUserProjectMappings(oldLogin, newLogin, during)
}

func (dbMappingStore) deleteMappings(login string, during func() errors.Error) errors.Error {
	return services.DeleteUserProjectMappingsForLogin(login, during)
}

// Service is the only holder of the Grafana client.
type Service struct {
	client         *grafanaClient
	managementUser string
	mappings       mappingStore
	audit          auditRecorder

	orgMu sync.Mutex
	orgID int64
}

var (
	defaultService *Service
	initOnce       sync.Once
)

// Init builds the package service from the Grafana management settings.
func Init(basicRes basecontext.BasicRes) {
	initOnce.Do(func() {
		cfg := basicRes.GetConfigReader()
		user := strings.TrimSpace(cfg.GetString("GRAFANA_MANAGEMENT_USER"))
		client, err := newGrafanaClient(cfg.GetString("GRAFANA_INTERNAL_URL"), user, cfg.GetString("GRAFANA_MANAGEMENT_PASSWORD"), nil)
		if err != nil {
			client = nil
		}
		defaultService = newServiceWithDependencies(client, user, dbMappingStore{}, nil)
	})
}

func newServiceWithDependencies(client *grafanaClient, managementUser string, mappings mappingStore, audit auditRecorder) *Service {
	return &Service{client: client, managementUser: managementUser, mappings: mappings, audit: audit}
}

func authorizeAdmin(admin *access.Principal) errors.Error {
	if admin == nil || admin.Role != access.RoleCustomerAdmin {
		return errors.Forbidden.New(adminRequiredMessage)
	}
	return nil
}

func codedError(kind *errors.Type, message, code string) errors.Error {
	return kind.New(message, errors.WithData(code))
}

func notConfiguredError() errors.Error {
	return codedError(errors.Unavailable, notConfiguredMessage, ErrCodeNotConfigured)
}

func unavailableError() errors.Error {
	return codedError(errors.Unavailable, unavailableMessage, ErrCodeUnavailable)
}

func notServerAdminError() errors.Error {
	return codedError(errors.Unavailable, notServerAdminMessage, ErrCodeNotServerAdmin)
}

// Status reports whether the management identity can currently administer Grafana.
func (s *Service) Status(ctx context.Context, admin *access.Principal) (*StatusResponse, errors.Error) {
	if err := authorizeAdmin(admin); err != nil {
		return nil, err
	}
	if s == nil || s.client == nil {
		return &StatusResponse{Code: ErrCodeNotConfigured}, nil
	}
	current, err := s.client.currentUser(ctx)
	if err != nil {
		return &StatusResponse{Code: ErrCodeUnavailable}, nil
	}
	if !current.IsGrafanaAdmin {
		return &StatusResponse{Code: ErrCodeNotServerAdmin}, nil
	}
	return &StatusResponse{Available: true}, nil
}

// ListUsers returns one page of org users with their project access and the mapping keys without an account.
func (s *Service) ListUsers(ctx context.Context, admin *access.Principal, query ListQuery) (*ListResponse, errors.Error) {
	if err := authorizeAdmin(admin); err != nil {
		return nil, err
	}
	if query.Page < 1 {
		return nil, errors.BadInput.New("page must be at least 1")
	}
	if query.PageSize < 1 || query.PageSize > maxPageSize {
		return nil, errors.BadInput.New("pageSize must be between 1 and 100")
	}
	if s == nil || s.client == nil {
		return nil, notConfiguredError()
	}
	orgID, err := s.managedOrgID(ctx)
	if err != nil {
		return nil, err
	}
	orgPage, clientErr := s.client.searchOrgUsers(ctx, orgID, query.Query, query.PageSize, query.Page)
	if clientErr != nil {
		return nil, unavailableError()
	}
	global, err := s.allGlobalUsers(ctx)
	if err != nil {
		return nil, err
	}

	admins := make(map[string]bool, len(global))
	logins := make(map[string]bool, len(global))
	var management *grafanaGlobalUser
	for i := range global {
		user := &global[i]
		logins[user.Login] = true
		admins[user.Login] = user.IsAdmin
		if s.isManagementLogin(user.Login) {
			management = user
		}
	}

	count := orgPage.TotalCount
	pageUsers := make([]grafanaOrgUser, 0, len(orgPage.OrgUsers))
	droppedManagement := false
	for _, user := range orgPage.OrgUsers {
		if s.isManagementLogin(user.Login) {
			droppedManagement = true
			continue
		}
		pageUsers = append(pageUsers, user)
	}
	if droppedManagement || s.managementMatchesQuery(management, query.Query) {
		count--
	}
	if count < 0 {
		count = 0
	}

	pageLogins := make([]string, 0, len(pageUsers))
	for _, user := range pageUsers {
		pageLogins = append(pageLogins, user.Login)
	}
	projectsByLogin, err := s.projectsByLogin(pageLogins)
	if err != nil {
		return nil, err
	}

	users := make([]GrafanaUser, 0, len(pageUsers))
	for _, user := range pageUsers {
		users = append(users, GrafanaUser{
			ID:         user.UserID,
			Email:      user.Email,
			Name:       user.Name,
			Role:       user.Role,
			Disabled:   user.IsDisabled,
			SSO:        len(user.AuthLabels) > 0,
			LastSeenAt: user.LastSeenAt,
			Protected:  admins[user.Login],
			Projects:   projectsOrEmpty(projectsByLogin[user.Login]),
		})
	}

	orphans, err := s.orphans(logins)
	if err != nil {
		return nil, err
	}
	return &ListResponse{Users: users, Count: count, Page: query.Page, PageSize: query.PageSize, Orphans: orphans}, nil
}

// managedOrgID reads the management identity's org once and keeps it for the process lifetime.
func (s *Service) managedOrgID(ctx context.Context) (int64, errors.Error) {
	s.orgMu.Lock()
	defer s.orgMu.Unlock()
	if s.orgID != 0 {
		return s.orgID, nil
	}
	current, err := s.client.currentUser(ctx)
	if err != nil {
		return 0, unavailableError()
	}
	if !current.IsGrafanaAdmin {
		return 0, notServerAdminError()
	}
	if current.OrgID == 0 {
		return 0, unavailableError()
	}
	s.orgID = current.OrgID
	return s.orgID, nil
}

func (s *Service) allGlobalUsers(ctx context.Context) ([]grafanaGlobalUser, errors.Error) {
	var all []grafanaGlobalUser
	for page := 1; page <= maxGlobalSearchPages; page++ {
		result, err := s.client.searchGlobalUsers(ctx, globalSearchPageSize, page)
		if err != nil {
			return nil, unavailableError()
		}
		all = append(all, result.Users...)
		if len(result.Users) == 0 || len(all) >= result.TotalCount {
			break
		}
	}
	return all, nil
}

func (s *Service) isManagementLogin(login string) bool {
	return s.managementUser != "" && strings.EqualFold(login, s.managementUser)
}

// managementMatchesQuery mirrors Grafana's substring search over login, email and name.
func (s *Service) managementMatchesQuery(management *grafanaGlobalUser, query string) bool {
	needle := strings.ToLower(query)
	candidates := []string{s.managementUser}
	if management != nil {
		candidates = append(candidates, management.Email, management.Name)
	}
	for _, candidate := range candidates {
		if strings.Contains(strings.ToLower(candidate), needle) {
			return true
		}
	}
	return false
}

func (s *Service) projectsByLogin(logins []string) (map[string][]string, errors.Error) {
	result := map[string][]string{}
	if len(logins) == 0 {
		return result, nil
	}
	mappings, err := s.mappings.mappingsForLogins(logins)
	if err != nil {
		return nil, err
	}
	for _, mapping := range mappings {
		result[mapping.UserLogin] = append(result[mapping.UserLogin], mapping.ProjectName)
	}
	return result, nil
}

func (s *Service) orphans(grafanaLogins map[string]bool) ([]Orphan, errors.Error) {
	stored, err := s.mappings.mappingLogins()
	if err != nil {
		return nil, err
	}
	orphanLogins := make([]string, 0)
	for _, login := range stored {
		if !grafanaLogins[login] {
			orphanLogins = append(orphanLogins, login)
		}
	}
	sort.Strings(orphanLogins)
	projects, err := s.projectsByLogin(orphanLogins)
	if err != nil {
		return nil, err
	}
	orphans := make([]Orphan, 0, len(orphanLogins))
	for _, login := range orphanLogins {
		orphans = append(orphans, Orphan{Account: login, Projects: projectsOrEmpty(projects[login])})
	}
	return orphans, nil
}

func projectsOrEmpty(projects []string) []string {
	if projects == nil {
		return []string{}
	}
	sorted := append([]string(nil), projects...)
	sort.Strings(sorted)
	return sorted
}
