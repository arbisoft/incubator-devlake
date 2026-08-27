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

// Package access owns the fork-specific interactive DevLake access directory.
// It intentionally does not use DevLake's imported engineering-data users or
// Grafana's independent user store.
package access

import (
	"time"

	"github.com/apache/incubator-devlake/core/models/common"
)

const (
	RoleCustomerAdmin = "customer_admin"
	RoleMember        = "member"

	StatusActive   = "active"
	StatusDisabled = "disabled"

	bootstrapClaimKey = "default"

	DefaultPageSize = 10
	MediumPageSize  = 25
	LargePageSize   = 50

	invalidPageSizeMessage = "pageSize must be 10, 25, or 50"
)

type AccessUser struct {
	common.Model
	Issuer      string     `gorm:"type:varchar(512);uniqueIndex:idx_auth_access_identity" json:"issuer"`
	Subject     string     `gorm:"type:varchar(255);uniqueIndex:idx_auth_access_identity" json:"subject"`
	Email       string     `gorm:"type:varchar(255);index:idx_auth_access_email" json:"email"`
	DisplayName string     `gorm:"type:varchar(255)" json:"displayName"`
	Role        string     `gorm:"type:varchar(32)" json:"role"`
	Status      string     `gorm:"type:varchar(32);index" json:"status"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
	DisabledAt  *time.Time `json:"disabledAt,omitempty"`
	HiddenAt    *time.Time `json:"hiddenAt,omitempty"`
}

func (AccessUser) TableName() string { return "auth_access_users" }

// BootstrapClaim records that the configured bootstrap administrator has been
// consumed. Its unique key makes the first-admin transition safe across API
// processes and OIDC providers.
type BootstrapClaim struct {
	common.Model
	Key string `gorm:"type:varchar(64);uniqueIndex"`
}

func (BootstrapClaim) TableName() string { return "auth_access_bootstrap_claims" }

type AccessDomain struct {
	common.Model
	Domain      string     `gorm:"type:varchar(255);uniqueIndex" json:"domain"`
	DefaultRole string     `gorm:"type:varchar(32)" json:"defaultRole"`
	Status      string     `gorm:"type:varchar(32);index" json:"status"`
	HiddenAt    *time.Time `json:"hiddenAt,omitempty"`
}

func (AccessDomain) TableName() string { return "auth_access_domains" }

type AuditEvent struct {
	common.Model
	ActorEmail  string `gorm:"type:varchar(255);index" json:"actorEmail"`
	Action      string `gorm:"type:varchar(64);index" json:"action"`
	TargetID    uint64 `gorm:"index" json:"targetId"`
	TargetEmail string `gorm:"type:varchar(255);index" json:"targetEmail"`
	Detail      string `gorm:"type:text" json:"detail"`
}

func (AuditEvent) TableName() string { return "auth_access_audit_events" }

type Identity struct {
	Issuer      string
	Subject     string
	Email       string
	DisplayName string
}

type Principal struct {
	UserID uint64
	Role   string
}

// PageQuery is the bounded, page-number query accepted by access-directory
// list endpoints. The UI deliberately exposes only the supported sizes.
type PageQuery struct {
	Page     int `form:"page"`
	PageSize int `form:"pageSize"`
}

func (query PageQuery) Normalize() (PageQuery, bool) {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize == 0 {
		query.PageSize = DefaultPageSize
	}
	if query.PageSize != DefaultPageSize && query.PageSize != MediumPageSize && query.PageSize != LargePageSize {
		return PageQuery{}, false
	}
	return query, true
}

func (query PageQuery) Offset() int { return (query.Page - 1) * query.PageSize }

type PaginatedUsers struct {
	Users    []AccessUser `json:"users"`
	Count    int64        `json:"count"`
	Page     int          `json:"page"`
	PageSize int          `json:"pageSize"`
}

type PaginatedDomains struct {
	Domains  []AccessDomain `json:"domains"`
	Count    int64          `json:"count"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
}

type CreateUserInput struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

type UpdateUserInput struct {
	Role   string `json:"role"`
	Status string `json:"status"`
}

type CreateDomainInput struct {
	Domain      string `json:"domain"`
	DefaultRole string `json:"defaultRole"`
}

type UpdateDomainInput struct {
	DefaultRole string `json:"defaultRole"`
	Status      string `json:"status"`
}
