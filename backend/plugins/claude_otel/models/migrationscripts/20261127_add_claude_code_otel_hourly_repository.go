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
	"github.com/apache/incubator-devlake/core/plugin"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelHourlyRepository)(nil)

const (
	addActivityRepositorySQL = `ALTER TABLE _tool_claude_code_otel_hourly_activity
  ADD COLUMN repository_url varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN repository_key binary(16) NOT NULL DEFAULT 0xD41D8CD98F00B204E9800998ECF8427E,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (connection_id, user_key, hour_start, repository_key),
  ADD INDEX idx_otel_hourly_activity_repository (connection_id, repository_url, hour_start)`
	addModelUsageRepositorySQL = `ALTER TABLE _tool_claude_code_otel_hourly_model_usage
  ADD COLUMN repository_url varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN repository_key binary(16) NOT NULL DEFAULT 0xD41D8CD98F00B204E9800998ECF8427E,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (connection_id, user_key, hour_start, model, query_source, effort, agent_name, skill_name, repository_key),
  ADD INDEX idx_otel_hourly_model_usage_repository (connection_id, repository_url, hour_start)`
	addToolUsageRepositorySQL = `ALTER TABLE _tool_claude_code_otel_hourly_tool_usage
  ADD COLUMN repository_url varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN repository_key binary(16) NOT NULL DEFAULT 0xD41D8CD98F00B204E9800998ECF8427E,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (connection_id, user_key, hour_start, tool_name, language, decision_source, repository_key),
  ADD INDEX idx_otel_hourly_tool_usage_repository (connection_id, repository_url, hour_start)`
	addSessionStartsRepositorySQL = `ALTER TABLE _tool_claude_code_otel_hourly_session_starts
  ADD COLUMN repository_url varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN repository_key binary(16) NOT NULL DEFAULT 0xD41D8CD98F00B204E9800998ECF8427E,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (connection_id, user_key, hour_start, session_id, start_type, repository_key),
  ADD INDEX idx_otel_hourly_session_starts_repository (connection_id, repository_url, hour_start)`
)

// addClaudeCodeOtelHourlyRepository is raw SQL because AutoMigrate cannot change a primary key.
type addClaudeCodeOtelHourlyRepository struct{}

func (*addClaudeCodeOtelHourlyRepository) Up(basicRes context.BasicRes) errors.Error {
	db := basicRes.GetDal()
	steps := []struct {
		table, statement, what string
	}{
		{"_tool_claude_code_otel_hourly_activity", addActivityRepositorySQL, "add repository to hourly activity"},
		{"_tool_claude_code_otel_hourly_model_usage", addModelUsageRepositorySQL, "add repository to hourly model usage"},
		{"_tool_claude_code_otel_hourly_tool_usage", addToolUsageRepositorySQL, "add repository to hourly tool usage"},
		{"_tool_claude_code_otel_hourly_session_starts", addSessionStartsRepositorySQL, "add repository to hourly session starts"},
	}
	// Each ALTER commits on its own, so a rerun skips the ones that already ran.
	for _, step := range steps {
		if db.HasColumn(step.table, "repository_key") {
			continue
		}
		if err := db.Exec(step.statement); err != nil {
			return errors.Default.Wrap(err, step.what)
		}
	}
	return nil
}

func (*addClaudeCodeOtelHourlyRepository) Version() uint64 { return 20261127120000 }

func (*addClaudeCodeOtelHourlyRepository) Name() string {
	return "add repository to claude code otel hourly facts"
}
