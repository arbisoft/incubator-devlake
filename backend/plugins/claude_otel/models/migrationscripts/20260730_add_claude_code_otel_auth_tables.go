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

var _ plugin.MigrationScript = (*addClaudeCodeOtelAuthTables)(nil)

type addClaudeCodeOtelAuthTables struct{}

type otelConnection20260730 struct {
	archived.Model
	Name              string `gorm:"type:varchar(255)"`
	CollectorEndpoint string `gorm:"type:varchar(255)"`
	Protocol          string `gorm:"type:varchar(32)"`
	Status            string `gorm:"type:varchar(32);index"`
	CreatedBy         string `gorm:"type:varchar(255)"`
	CreatedByEmail    string `gorm:"type:varchar(255)"`
	UpdatedBy         string `gorm:"type:varchar(255)"`
	UpdatedByEmail    string `gorm:"type:varchar(255)"`
}

func (otelConnection20260730) TableName() string {
	return "_tool_claude_code_otel_connections"
}

type otelCredential20260730 struct {
	archived.Model
	ConnectionId             uint64 `gorm:"index"`
	Username                 string `gorm:"type:varchar(255);uniqueIndex"`
	Status                   string `gorm:"type:varchar(32);index"`
	RotatedAt                *time.Time
	RevokedAt                *time.Time
	PendingCollectorRestart  bool
	LastCollectorRestartHint string `gorm:"type:varchar(255)"`
}

func (otelCredential20260730) TableName() string {
	return "_tool_claude_code_otel_credentials"
}

func (script *addClaudeCodeOtelAuthTables) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(
		basicRes,
		&otelConnection20260730{},
		&otelCredential20260730{},
	)
}

func (*addClaudeCodeOtelAuthTables) Version() uint64 {
	return 20260730120000
}

func (*addClaudeCodeOtelAuthTables) Name() string {
	return "add claude code otel auth metadata tables"
}
