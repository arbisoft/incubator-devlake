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
	Domain      string `gorm:"type:varchar(255);uniqueIndex" json:"domain"`
	DefaultRole string `gorm:"type:varchar(32)" json:"defaultRole"`
	Status      string `gorm:"type:varchar(32);index" json:"status"`
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
