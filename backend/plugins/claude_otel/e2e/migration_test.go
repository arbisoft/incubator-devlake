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
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/code"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ticket"
	coremigrations "github.com/apache/incubator-devlake/core/models/migrationscripts"
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
	// The models include the repository key, so the primary-key check below needs this migration too.
	repository := script(20261127120000)
	require.NoError(t, repository.Up(basicRes))
	require.NoError(t, repository.Up(basicRes), "a rerun after a partial failure must succeed")

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

func TestPromptToolsAndSessionHooksMigrationIsRerunnable(t *testing.T) {
	tester := e2ehelper.NewDataFlowTester(t, "claude_otel", impl.ClaudeOtel{})
	basicRes := contextimpl.NewDefaultBasicRes(tester.Cfg, tester.Log, tester.Dal)
	var script plugin.MigrationScript
	for _, candidate := range coremigrations.All() {
		if candidate.Version() == 20261111120000 {
			script = candidate
		}
	}
	require.NotNil(t, script, "core migration 20261111120000 is not registered")
	require.NoError(t, script.Up(basicRes))
	require.NoError(t, script.Up(basicRes), "a rerun must succeed")
	for _, table := range []string{"ai_prompt_tools", "ai_session_hooks"} {
		require.True(t, tester.Dal.HasTable(table), table)
	}
	for _, column := range []string{"hook_count", "hook_block_count", "hook_error_count", "hook_duration_ms", "idle_before_seconds", "first_request_context_tokens", "first_request_cost_usd"} {
		require.True(t, tester.Dal.HasColumn("ai_prompts", column), column)
	}
}

func TestAiCommitsMigrationIsRerunnable(t *testing.T) {
	tester := e2ehelper.NewDataFlowTester(t, "claude_otel", impl.ClaudeOtel{})
	basicRes := contextimpl.NewDefaultBasicRes(tester.Cfg, tester.Log, tester.Dal)
	var script plugin.MigrationScript
	for _, candidate := range coremigrations.All() {
		if candidate.Version() == 20261113120000 {
			script = candidate
		}
	}
	require.NotNil(t, script, "core migration 20261113120000 is not registered")
	require.NoError(t, script.Up(basicRes))
	require.NoError(t, script.Up(basicRes), "a rerun must succeed")
	require.True(t, tester.Dal.HasTable("ai_commits"))
	for _, column := range []string{"commit_sha", "branch_name", "prompt_id", "first_seen_at", "repository_url"} {
		require.True(t, tester.Dal.HasColumn("ai_commits", column), column)
	}
}

func TestDashboardDateIndexesMigrationIsRerunnable(t *testing.T) {
	tester := e2ehelper.NewDataFlowTester(t, "claude_otel", impl.ClaudeOtel{})
	basicRes := contextimpl.NewDefaultBasicRes(tester.Cfg, tester.Log, tester.Dal)
	var script plugin.MigrationScript
	for _, candidate := range coremigrations.All() {
		if candidate.Version() == 20261113130000 {
			script = candidate
		}
	}
	require.NotNil(t, script, "core migration 20261113130000 is not registered")

	indexes := map[string]string{
		"commits":          "idx_commits_authored_date",
		"repo_commits":     "idx_repo_commits_commit_sha",
		"issue_changelogs": "idx_issue_changelogs_created_date",
	}
	hasIndex := func(table, index string) bool {
		var count int
		require.NoError(t, tester.Db.Raw(
			"SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
			table, index).Row().Scan(&count))
		return count > 0
	}
	createTable := func(table string) string {
		var name, ddl string
		require.NoError(t, tester.Db.Raw("SHOW CREATE TABLE "+table).Row().Scan(&name, &ddl))
		return ddl
	}
	require.NoError(t, tester.Dal.AutoMigrate(&code.Commit{}))
	require.NoError(t, tester.Dal.AutoMigrate(&code.RepoCommit{}))
	require.NoError(t, tester.Dal.AutoMigrate(&ticket.IssueChangelogs{}))

	before := map[string]string{}
	for table, index := range indexes {
		if hasIndex(table, index) {
			require.NoError(t, tester.Dal.Exec("DROP INDEX "+index+" ON "+table))
		}
		before[table] = createTable(table)
	}

	require.NoError(t, script.Up(basicRes))
	require.NoError(t, script.Up(basicRes), "a rerun must succeed")

	for table, index := range indexes {
		require.True(t, hasIndex(table, index), "%s.%s", table, index)
		var kept []string
		for _, line := range strings.Split(createTable(table), "\n") {
			if !strings.Contains(line, index) {
				kept = append(kept, line)
			}
		}
		// Dropping the index line can leave a dangling comma on the last key line.
		require.Equal(t, strings.ReplaceAll(before[table], ",\n)", "\n)"), strings.ReplaceAll(strings.Join(kept, "\n"), ",\n)", "\n)"), table)
	}
}

func TestHourlyRepositoryMigrationKeysExistingRowsByEmptyRepository(t *testing.T) {
	tester := e2ehelper.NewDataFlowTester(t, "claude_otel", impl.ClaudeOtel{})
	basicRes := contextimpl.NewDefaultBasicRes(tester.Cfg, tester.Log, tester.Dal)
	hourly := []struct {
		table, index string
		model        dal.Tabler
		columns      string
		values       string
	}{
		{models.OtelHourlyActivityTable, "idx_otel_hourly_activity_repository", &models.OtelHourlyActivity{}, "", ""},
		{models.OtelHourlyModelUsageTable, "idx_otel_hourly_model_usage_repository", &models.OtelHourlyModelUsage{}, ", model, query_source", ", 'm', 'main'"},
		{models.OtelHourlyToolUsageTable, "idx_otel_hourly_tool_usage_repository", &models.OtelHourlyToolUsage{}, ", tool_name, language", ", 'Edit', 'Go'"},
		{models.OtelHourlySessionStartsTable, "idx_otel_hourly_session_starts_repository", &models.OtelHourlySessionStart{}, ", session_id, start_type", ", 's1', 'fresh'"},
	}
	t.Cleanup(func() {
		for _, table := range hourly {
			tester.FlushTabler(table.model)
		}
	})
	for _, table := range hourly {
		require.NoError(t, tester.Dal.Exec("DROP TABLE IF EXISTS "+table.table))
	}
	scripts := make(map[uint64]plugin.MigrationScript)
	for _, candidate := range migrationscripts.All() {
		scripts[candidate.Version()] = candidate
	}
	for _, version := range []uint64{20260914130000, 20261109120000, 20261109130000} {
		require.NoError(t, scripts[version].Up(basicRes), "%d", version)
	}
	for _, table := range hourly {
		require.NoError(t, tester.Dal.Exec(fmt.Sprintf("INSERT INTO %s (connection_id, user_key, hour_start%s) VALUES (1, 'u', '2026-11-26 09:00:00'%s)", table.table, table.columns, table.values)), table.table)
	}

	repository := scripts[20261127120000]
	require.NotNil(t, repository)
	require.NoError(t, repository.Up(basicRes))
	require.NoError(t, repository.Up(basicRes), "a rerun must succeed")

	for _, table := range hourly {
		var rows int
		var emptyKeyRows int
		require.NoError(t, tester.Db.Raw("SELECT COUNT(*), COALESCE(SUM(repository_url = '' AND repository_key = UNHEX(MD5(''))), 0) FROM "+table.table).Row().Scan(&rows, &emptyKeyRows), table.table)
		require.Equal(t, 1, rows, table.table)
		require.Equal(t, 1, emptyKeyRows, table.table)

		parsed, err := schema.Parse(table.model, &sync.Map{}, schema.NamingStrategy{})
		require.NoError(t, err)
		var want []string
		for _, field := range parsed.PrimaryFields {
			want = append(want, field.DBName)
		}
		var got []string
		require.NoError(t, tester.Db.Raw(
			"SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION",
			table.table).Scan(&got).Error)
		require.Equal(t, want, got, table.table)
		require.Equal(t, "repository_key", got[len(got)-1], table.table)

		var indexed []string
		require.NoError(t, tester.Db.Raw(
			"SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX",
			table.table, table.index).Scan(&indexed).Error, table.index)
		require.Equal(t, []string{"connection_id", "repository_url", "hour_start"}, indexed, table.index)
	}
}

func TestAiDailyFactsRepositoryMigrationBackfillsOnlyClaudeRows(t *testing.T) {
	tester := e2ehelper.NewDataFlowTester(t, "claude_otel", impl.ClaudeOtel{})
	basicRes := contextimpl.NewDefaultBasicRes(tester.Cfg, tester.Log, tester.Dal)
	var script plugin.MigrationScript
	for _, candidate := range coremigrations.All() {
		if candidate.Version() == 20261127120000 {
			script = candidate
		}
	}
	require.NotNil(t, script, "core migration 20261127120000 is not registered")
	tables := []dal.Tabler{&ai.AiActivity{}, &ai.AiModelUsage{}, &ai.AiToolDecision{}}
	t.Cleanup(func() {
		for _, table := range tables {
			tester.FlushTabler(table)
		}
	})
	for _, table := range tables {
		tester.FlushTabler(table)
	}

	day := time.Date(2026, 11, 26, 0, 0, 0, 0, time.UTC)
	entity := func(id string) domainlayer.DomainEntity { return domainlayer.DomainEntity{Id: id} }
	kind := func(value string) *string { return &value }
	require.NoError(t, tester.Dal.Create(&ai.AiActivity{DomainEntity: entity("claude-canonical"), Provider: "claude", Date: day, RecordKind: kind(ai.CanonicalActivityRecordKind)}))
	require.NoError(t, tester.Dal.Create(&ai.AiActivity{DomainEntity: entity("claude-other-kind"), Provider: "claude", Date: day, RecordKind: kind("other")}))
	require.NoError(t, tester.Dal.Create(&ai.AiActivity{DomainEntity: entity("cursor"), Provider: "cursor", Date: day}))
	require.NoError(t, tester.Dal.Create(&ai.AiModelUsage{DomainEntity: entity("claude-model"), Provider: "claude", Date: day, EstimatedCostUsd: "0", SourceUpdatedAt: day}))
	require.NoError(t, tester.Dal.Create(&ai.AiModelUsage{DomainEntity: entity("cursor-model"), Provider: "cursor", Date: day, EstimatedCostUsd: "0", SourceUpdatedAt: day}))
	require.NoError(t, tester.Dal.Create(&ai.AiToolDecision{DomainEntity: entity("claude-tool"), Provider: "claude", Date: day, SourceUpdatedAt: day}))
	require.NoError(t, tester.Dal.Create(&ai.AiToolDecision{DomainEntity: entity("cursor-tool"), Provider: "cursor", Date: day, SourceUpdatedAt: day}))
	for _, table := range []string{"ai_activities", "ai_model_usages", "ai_tool_decisions"} {
		require.NoError(t, tester.Dal.Exec("ALTER TABLE "+table+" DROP COLUMN repository_url"))
	}

	require.NoError(t, script.Up(basicRes))
	require.NoError(t, script.Up(basicRes), "a rerun must succeed")

	repositories := func(table string) map[string]sql.NullString {
		rows, err := tester.Db.Raw("SELECT id, repository_url FROM " + table).Rows()
		require.NoError(t, err)
		defer rows.Close()
		out := make(map[string]sql.NullString)
		for rows.Next() {
			var id string
			var url sql.NullString
			require.NoError(t, rows.Scan(&id, &url))
			out[id] = url
		}
		return out
	}
	empty, null := sql.NullString{Valid: true}, sql.NullString{}
	require.Equal(t, map[string]sql.NullString{"claude-canonical": empty, "claude-other-kind": null, "cursor": null}, repositories("ai_activities"))
	require.Equal(t, map[string]sql.NullString{"claude-model": empty, "cursor-model": null}, repositories("ai_model_usages"))
	require.Equal(t, map[string]sql.NullString{"claude-tool": empty, "cursor-tool": null}, repositories("ai_tool_decisions"))
}
