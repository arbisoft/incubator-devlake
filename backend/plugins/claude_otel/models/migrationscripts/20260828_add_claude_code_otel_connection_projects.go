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
	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelConnectionProjects)(nil)

type addClaudeCodeOtelConnectionProjects struct{}

type otelConnectionProject20260828 struct {
	archived.Model
	ConnectionId uint64 `gorm:"uniqueIndex:idx_otel_connection_project;index;not null"`
	ProjectName  string `gorm:"type:varchar(255);uniqueIndex:idx_otel_connection_project;index;not null"`
}

func (otelConnectionProject20260828) TableName() string {
	return "_tool_claude_code_otel_connection_projects"
}

func (script *addClaudeCodeOtelConnectionProjects) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &otelConnectionProject20260828{})
}

func (*addClaudeCodeOtelConnectionProjects) Version() uint64 {
	return 20260828120000
}

func (*addClaudeCodeOtelConnectionProjects) Name() string {
	return "add claude code otel connection project placements"
}
