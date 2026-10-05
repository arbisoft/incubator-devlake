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

var _ plugin.MigrationScript = (*retireClaudePlatformPlugin)(nil)

// retireClaudePlatformPlugin removes what the deleted claude plugin left behind, by exact name only.
type retireClaudePlatformPlugin struct{}

func (*retireClaudePlatformPlugin) Up(basicRes context.BasicRes) errors.Error {
	db := basicRes.GetDal()
	// Never a _tool_claude_% pattern: _tool_claude_code_* shares the prefix.
	err := db.DropTables(
		"_tool_claude_connections",
		"_tool_claude_scopes",
		"_tool_claude_scope_configs",
		"_tool_claude_usage",
		"_raw_claude_usage",
	)
	if err != nil {
		return err
	}
	// claude_otel also writes provider 'claude', so match the raw table instead.
	cleanups := []struct {
		sql  string
		args []interface{}
	}{
		{`DELETE FROM ai_activities WHERE _raw_data_table = ?`, []interface{}{"_raw_claude_usage"}},
		{`DELETE FROM _devlake_collector_latest_state WHERE raw_data_table = ?`, []interface{}{"_raw_claude_usage"}},
		{`DELETE FROM _devlake_subtask_states WHERE plugin = ?`, []interface{}{"claude"}},
		{`DELETE FROM _devlake_blueprint_scopes WHERE plugin_name = ?`, []interface{}{"claude"}},
		{`DELETE FROM _devlake_blueprint_connections WHERE plugin_name = ?`, []interface{}{"claude"}},
		// Lets a revert of this change rerun the plugin's own migrations.
		{`DELETE FROM _devlake_migration_history WHERE script_version = ? AND script_name = ?`, []interface{}{uint64(20260325000001), "add Claude initial tables"}},
		{`DELETE FROM _devlake_migration_history WHERE script_version = ? AND script_name = ?`, []interface{}{uint64(20260402000001), "fix _tool_claude_usage schema: add scope_id and model to primary key"}},
		{`DELETE FROM _devlake_migration_history WHERE script_version = ? AND script_name = ?`, []interface{}{uint64(20260403000001), "add tool_actions and cache token columns to _tool_claude_usage"}},
	}
	for _, c := range cleanups {
		if err := db.Exec(c.sql, c.args...); err != nil {
			return err
		}
	}
	return nil
}

func (*retireClaudePlatformPlugin) Version() uint64 {
	return 20261002000001
}

func (*retireClaudePlatformPlugin) Name() string {
	return "retire claude platform plugin"
}
