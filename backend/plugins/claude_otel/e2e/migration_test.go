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

package e2e

import (
	"database/sql"
	"regexp"
	"strconv"
	"sync"
	"testing"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/e2ehelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/plugins/claude_otel/impl"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models/migrationscripts"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm/schema"
)

var varcharWidth = regexp.MustCompile(`(?i)^varchar\((\d+)\)$`)

func TestHourlyAttributionMigrationIsRerunnableAndMatchesModels(t *testing.T) {
	tester := e2ehelper.NewDataFlowTester(t, "claude_otel", impl.ClaudeOtel{})
	basicRes := contextimpl.NewDefaultBasicRes(tester.Cfg, tester.Log, tester.Dal)
	// Later tests start from tables built from the models.
	t.Cleanup(func() {
		tester.FlushTabler(&models.OtelHourlyModelUsage{})
		tester.FlushTabler(&models.OtelHourlyToolUsage{})
	})
	for _, table := range []string{models.OtelHourlyModelUsageTable, models.OtelHourlyToolUsageTable} {
		require.NoError(t, tester.Dal.Exec("DROP TABLE IF EXISTS "+table))
	}
	script := func(version uint64) plugin.MigrationScript {
		for _, candidate := range migrationscripts.All() {
			if candidate.Version() == version {
				return candidate
			}
		}
		require.FailNow(t, "migration script not found", "version %d", version)
		return nil
	}
	require.NoError(t, script(20260914130000).Up(basicRes))
	attribution := script(20261109120000)
	require.NoError(t, attribution.Up(basicRes))
	require.NoError(t, attribution.Up(basicRes), "a rerun after a partial failure must succeed")

	type column struct {
		table, name string
		model       dal.Tabler
		field       string
	}
	columns := []column{
		{models.OtelHourlyModelUsageTable, "effort", &models.OtelHourlyModelUsage{}, "Effort"},
		{models.OtelHourlyModelUsageTable, "agent_name", &models.OtelHourlyModelUsage{}, "AgentName"},
		{models.OtelHourlyModelUsageTable, "skill_name", &models.OtelHourlyModelUsage{}, "SkillName"},
		{models.OtelHourlyToolUsageTable, "decision_source", &models.OtelHourlyToolUsage{}, "DecisionSource"},
	}
	for _, want := range columns {
		parsed, err := schema.Parse(want.model, &sync.Map{}, schema.NamingStrategy{})
		require.NoError(t, err)
		field := parsed.LookUpField(want.field)
		require.NotNil(t, field, want.field)
		match := varcharWidth.FindStringSubmatch(field.TagSettings["TYPE"])
		require.NotNil(t, match, "%s has no varchar width", want.field)
		width, err := strconv.ParseInt(match[1], 10, 64)
		require.NoError(t, err)

		var nullable string
		var defaultValue sql.NullString
		var length sql.NullInt64
		require.NoError(t, tester.Db.Raw(
			"SELECT IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
			want.table, want.name).Row().Scan(&nullable, &defaultValue, &length), "%s.%s", want.table, want.name)
		require.Equal(t, "NO", nullable, want.name)
		require.True(t, defaultValue.Valid && defaultValue.String == "", "%s default = %v, want ''", want.name, defaultValue)
		require.Equal(t, width, length.Int64, want.name)
	}

	for table, model := range map[string]dal.Tabler{models.OtelHourlyModelUsageTable: &models.OtelHourlyModelUsage{}, models.OtelHourlyToolUsageTable: &models.OtelHourlyToolUsage{}} {
		parsed, err := schema.Parse(model, &sync.Map{}, schema.NamingStrategy{})
		require.NoError(t, err)
		var want []string
		for _, field := range parsed.PrimaryFields {
			want = append(want, field.DBName)
		}
		var got []string
		require.NoError(t, tester.Db.Raw(
			"SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION",
			table).Scan(&got).Error)
		require.Equal(t, want, got, table)
	}
}
