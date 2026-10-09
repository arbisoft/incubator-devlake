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

import "github.com/apache/incubator-devlake/server/api/access"

const (
	ErrCodeNotConfigured  = "GRAFANA_NOT_CONFIGURED"
	ErrCodeUnavailable    = "GRAFANA_UNAVAILABLE"
	ErrCodeNotServerAdmin = "GRAFANA_NOT_SERVER_ADMIN"
	ErrCodeUserExists     = "GRAFANA_USER_EXISTS"
	ErrCodeUserNotFound   = "GRAFANA_USER_NOT_FOUND"
	ErrCodeUserProtected  = "GRAFANA_USER_PROTECTED"
	ErrCodeUserSSOManaged = "GRAFANA_USER_SSO_MANAGED"
	ErrCodeLastAdmin      = "GRAFANA_LAST_ADMIN"
	ErrCodePasswordShort  = "GRAFANA_PASSWORD_TOO_SHORT"
	ErrCodePasswordBad    = "GRAFANA_PASSWORD_REJECTED"
	ErrCodeProjectMissing = "PROJECT_NOT_FOUND"
	ErrCodePartial        = "GRAFANA_PARTIAL"
	defaultPage           = 1
	defaultPageSize       = 20
	maxPageSize           = 100
	globalSearchPageSize  = 1000
	maxGlobalSearchPages  = 1000
	// Same limits as the local password rule in server/api/auth/local_password.go.
	passwordMinimumCharacters = 15
	passwordMaximumBytes      = 1024
	adminRequiredMessage      = "administrator role required"
	notConfiguredMessage      = "Grafana user management is not configured"
	unavailableMessage        = "Grafana is unavailable"
	notServerAdminMessage     = "the Grafana management identity is not a server administrator"
)

// StatusResponse reports whether Grafana user management can be used right now.
type StatusResponse struct {
	Available bool   `json:"available"`
	Code      string `json:"code,omitempty"`
}

// GrafanaUser is one Grafana org member as shown to a DevLake administrator.
type GrafanaUser struct {
	ID         int64    `json:"id"`
	Email      string   `json:"email"`
	Name       string   `json:"name"`
	Role       string   `json:"role"`
	Disabled   bool     `json:"disabled"`
	SSO        bool     `json:"sso"`
	LastSeenAt string   `json:"lastSeenAt,omitempty"`
	Protected  bool     `json:"protected"`
	Projects   []string `json:"projects"`
}

// Orphan is a stored mapping key that has no Grafana account.
type Orphan struct {
	Account  string   `json:"account"`
	Projects []string `json:"projects"`
}

// ListResponse is the paged user list plus the mapping keys without an account.
type ListResponse struct {
	Users    []GrafanaUser `json:"users"`
	Count    int           `json:"count"`
	Page     int           `json:"page"`
	PageSize int           `json:"pageSize"`
	Orphans  []Orphan      `json:"orphans"`
}

// ListQuery is the validated input of the user list.
type ListQuery struct {
	Query    string
	Page     int
	PageSize int
}

// CreateUserInput is the body of a create request.
type CreateUserInput struct {
	Email        string   `json:"email"`
	Name         string   `json:"name"`
	Role         string   `json:"role"`
	ProjectNames []string `json:"projectNames"`
	Password     string   `json:"password"`
}

// PatchUserInput is the body of an update request; absent fields are left alone.
type PatchUserInput struct {
	Name     *string `json:"name"`
	Email    *string `json:"email"`
	Role     *string `json:"role"`
	Disabled *bool   `json:"disabled"`
}

// ProjectsInput is the full set of projects a user can see.
type ProjectsInput struct {
	ProjectNames []string `json:"projectNames"`
}

// PasswordInput is the body of a password change.
type PasswordInput struct {
	Password string `json:"password"`
}

// partialData is the error data of a create that left an account behind.
type partialData struct {
	userID int64
}

// PartialErrorResponse is the error body when an account was created but a later step failed.
type PartialErrorResponse struct {
	access.ApiErrorResponse
	UserID int64 `json:"userId"`
}
