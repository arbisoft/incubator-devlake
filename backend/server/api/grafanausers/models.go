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

const (
	ErrCodeNotConfigured  = "GRAFANA_NOT_CONFIGURED"
	ErrCodeUnavailable    = "GRAFANA_UNAVAILABLE"
	ErrCodeNotServerAdmin = "GRAFANA_NOT_SERVER_ADMIN"
	defaultPage           = 1
	defaultPageSize       = 20
	maxPageSize           = 100
	globalSearchPageSize  = 1000
	maxGlobalSearchPages  = 1000
	adminRequiredMessage  = "administrator role required"
	notConfiguredMessage  = "Grafana user management is not configured"
	unavailableMessage    = "Grafana is unavailable"
	notServerAdminMessage = "the Grafana management identity is not a server administrator"
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
