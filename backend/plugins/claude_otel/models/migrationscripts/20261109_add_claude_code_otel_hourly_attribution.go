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

var _ plugin.MigrationScript = (*addClaudeCodeOtelHourlyAttribution)(nil)

const (
	addModelUsageAttributionSQL = `ALTER TABLE _tool_claude_code_otel_hourly_model_usage
  ADD COLUMN effort varchar(16) NOT NULL DEFAULT '',
  ADD COLUMN agent_name varchar(64) NOT NULL DEFAULT '',
  ADD COLUMN skill_name varchar(64) NOT NULL DEFAULT '',
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (connection_id, user_key, hour_start, model, query_source, effort, agent_name, skill_name)`
	addToolUsageAttributionSQL = `ALTER TABLE _tool_claude_code_otel_hourly_tool_usage
  ADD COLUMN decision_source varchar(32) NOT NULL DEFAULT '',
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (connection_id, user_key, hour_start, tool_name, language, decision_source)`
)

// addClaudeCodeOtelHourlyAttribution is raw SQL because AutoMigrate cannot change a primary key.
type addClaudeCodeOtelHourlyAttribution struct{}

func (*addClaudeCodeOtelHourlyAttribution) Up(basicRes context.BasicRes) errors.Error {
	db := basicRes.GetDal()
	// Each ALTER commits on its own, so a rerun skips the one that already ran.
	if !db.HasColumn("_tool_claude_code_otel_hourly_model_usage", "effort") {
		if err := db.Exec(addModelUsageAttributionSQL); err != nil {
			return errors.Default.Wrap(err, "add attribution dimensions to hourly model usage")
		}
	}
	if !db.HasColumn("_tool_claude_code_otel_hourly_tool_usage", "decision_source") {
		if err := db.Exec(addToolUsageAttributionSQL); err != nil {
			return errors.Default.Wrap(err, "add decision source to hourly tool usage")
		}
	}
	return nil
}

func (*addClaudeCodeOtelHourlyAttribution) Version() uint64 { return 20261109120000 }

func (*addClaudeCodeOtelHourlyAttribution) Name() string {
	return "add attribution dimensions to claude code otel hourly facts"
}
