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

package models

import (
	"testing"

	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models/migrationscripts"
	"github.com/stretchr/testify/require"
)

func TestPhase6ModelAndMigrationContract(t *testing.T) {
	tables := make([]string, 0)
	for _, table := range GetTablesInfo() {
		tables = append(tables, table.TableName())
	}

	require.ElementsMatch(t, []string{
		"_tool_claude_enterprise_connections",
		"_tool_claude_enterprise_scopes",
		"_tool_claude_enterprise_scope_configs",
		"_tool_claude_enterprise_analytics_records",
		"_tool_claude_enterprise_summaries",
		"_tool_claude_enterprise_usage_reports",
		"_tool_claude_enterprise_cost_reports",
		"_tool_claude_enterprise_skills",
		"_tool_claude_enterprise_connectors",
		"_tool_claude_enterprise_chat_projects",
		"_tool_claude_enterprise_plugins",
		"_tool_claude_enterprise_artifacts",
	}, tables)

	migrations := migrationscripts.All()
	require.Len(t, migrations, 4)
	require.Equal(t, uint64(20260325000001), migrations[0].Version())
	require.Equal(t, uint64(20260713000001), migrations[1].Version())
	require.Equal(t, uint64(20260714000001), migrations[2].Version())
	require.Equal(t, uint64(20260715000001), migrations[3].Version())
	require.NotContains(t, migrations[0].Name(), "drop")
	require.NotContains(t, migrations[1].Name(), "drop")
	require.NotContains(t, migrations[2].Name(), "drop")
	require.NotContains(t, migrations[3].Name(), "drop")
}
