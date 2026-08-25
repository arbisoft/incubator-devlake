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

package migrationscripts

import (
	"time"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addAuthAccessDirectory)(nil)

type authAccessUser20260825 struct {
	archived.Model
	Issuer      string `gorm:"type:varchar(512);uniqueIndex:idx_auth_access_identity"`
	Subject     string `gorm:"type:varchar(255);uniqueIndex:idx_auth_access_identity"`
	Email       string `gorm:"type:varchar(255);index:idx_auth_access_email"`
	DisplayName string `gorm:"type:varchar(255)"`
	Role        string `gorm:"type:varchar(32)"`
	Status      string `gorm:"type:varchar(32);index"`
	LastLoginAt *time.Time
	DisabledAt  *time.Time
}

func (authAccessUser20260825) TableName() string { return "auth_access_users" }

type authAccessDomain20260825 struct {
	archived.Model
	Domain      string `gorm:"type:varchar(255);uniqueIndex"`
	DefaultRole string `gorm:"type:varchar(32)"`
	Status      string `gorm:"type:varchar(32);index"`
}

func (authAccessDomain20260825) TableName() string { return "auth_access_domains" }

type authAccessAuditEvent20260825 struct {
	archived.Model
	ActorEmail  string `gorm:"type:varchar(255);index"`
	Action      string `gorm:"type:varchar(64);index"`
	TargetID    uint64 `gorm:"index"`
	TargetEmail string `gorm:"type:varchar(255);index"`
	Detail      string `gorm:"type:text"`
}

func (authAccessAuditEvent20260825) TableName() string { return "auth_access_audit_events" }

type authAccessBootstrapClaim20260825 struct {
	archived.Model
	Key string `gorm:"type:varchar(64);uniqueIndex"`
}

func (authAccessBootstrapClaim20260825) TableName() string { return "auth_access_bootstrap_claims" }

type authSessionProvider20260825 struct {
	Provider string `gorm:"type:varchar(64);index"`
}

func (authSessionProvider20260825) TableName() string { return "auth_sessions" }

type addAuthAccessDirectory struct{}

func (*addAuthAccessDirectory) Up(basicRes context.BasicRes) errors.Error {
	if err := migrationhelper.AutoMigrateTables(
		basicRes,
		new(authAccessUser20260825),
		new(authAccessDomain20260825),
		new(authAccessAuditEvent20260825),
		new(authAccessBootstrapClaim20260825),
	); err != nil {
		return err
	}
	// Older local databases can already contain this forward-compatible column.
	// Do not hide real migration errors such as a missing or inaccessible table.
	if !basicRes.GetDal().HasColumn("auth_sessions", "provider") {
		return basicRes.GetDal().AddColumn("auth_sessions", "provider", "varchar(64)")
	}
	return nil
}

func (*addAuthAccessDirectory) Version() uint64 { return 20260825000001 }

func (*addAuthAccessDirectory) Name() string { return "add native auth access directory" }
