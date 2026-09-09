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

var _ plugin.MigrationScript = (*addAuthLocalCredentials)(nil)

// These migration-local types deliberately pin the persistent schema. Runtime
// models can evolve without changing this append-only migration contract.
type authLocalCredential20260907 struct {
	archived.Model
	AccessUserID       uint64 `gorm:"uniqueIndex:idx_auth_local_credentials_access_user"`
	LoginName          string `gorm:"type:varchar(64);uniqueIndex:idx_auth_local_credentials_login_name"`
	PasswordHash       string `gorm:"type:text"`
	PasswordChangedAt  *time.Time
	MustChangePassword bool
}

func (authLocalCredential20260907) TableName() string { return "auth_local_credentials" }

type authLocalLoginAttempt20260907 struct {
	archived.Model
	BucketKind      string     `gorm:"type:varchar(32);uniqueIndex:idx_auth_local_login_attempt_bucket"`
	BucketKey       string     `gorm:"type:char(64);uniqueIndex:idx_auth_local_login_attempt_bucket"`
	FailureCount    uint       `gorm:"not null"`
	WindowStartedAt time.Time  `gorm:"not null"`
	BlockedUntil    *time.Time `gorm:"index"`
}

func (authLocalLoginAttempt20260907) TableName() string { return "auth_local_login_attempts" }

type authLocalBootstrapClaim20260907 struct {
	archived.Model
	Key string `gorm:"type:varchar(64);uniqueIndex:idx_auth_local_bootstrap_claim_key"`
}

func (authLocalBootstrapClaim20260907) TableName() string { return "auth_local_bootstrap_claims" }

type addAuthLocalCredentials struct{}

func (*addAuthLocalCredentials) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(
		basicRes,
		new(authLocalCredential20260907),
		new(authLocalLoginAttempt20260907),
		new(authLocalBootstrapClaim20260907),
	)
}

func (*addAuthLocalCredentials) Version() uint64 { return 20260907000001 }

func (*addAuthLocalCredentials) Name() string { return "add local password credentials" }
