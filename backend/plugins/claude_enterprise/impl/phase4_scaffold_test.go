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

package impl

import (
	"testing"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
	"github.com/stretchr/testify/require"
)

func TestPhase4ScaffoldApiResourcesCompile(t *testing.T) {
	resources := (ClaudeEnterprise{}).ApiResources()

	expected := map[string][]string{
		"test":                                      {"POST"},
		"connections":                               {"POST", "GET"},
		"connections/:connectionId":                 {"GET", "PATCH", "DELETE"},
		"connections/:connectionId/test":            {"POST"},
		"connections/:connectionId/scopes":          {"GET", "PUT"},
		"connections/:connectionId/scopes/:scopeId": {"GET", "PATCH", "DELETE"},
		"connections/:connectionId/scopes/:scopeId/latest-sync-state": {"GET"},
		"connections/:connectionId/remote-scopes":                     {"GET"},
		"connections/:connectionId/search-remote-scopes":              {"GET"},
		"connections/:connectionId/scope-configs":                     {"POST", "GET"},
		"connections/:connectionId/scope-configs/:scopeConfigId":      {"GET", "PATCH", "DELETE"},
		"scope-config/:scopeConfigId/projects":                        {"GET"},
	}

	for path, methods := range expected {
		t.Run(path, func(t *testing.T) {
			require.Contains(t, resources, path)
			for _, method := range methods {
				require.NotNil(t, resources[path][method])
			}
		})
	}
}

func TestPhase4ScaffoldModelAndMigrationTablesCompile(t *testing.T) {
	pluginTables := tableNames((ClaudeEnterprise{}).GetTablesInfo())
	modelTables := tableNames(models.GetTablesInfo())

	require.Equal(t, modelTables, pluginTables)
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
	}, pluginTables)

	migrations := (ClaudeEnterprise{}).MigrationScripts()
	require.NotEmpty(t, migrations)
	require.Equal(t, uint64(20260325000001), migrations[0].Version())
	require.Equal(t, uint64(20260713000001), migrations[1].Version())
	require.Equal(t, uint64(20260714000001), migrations[2].Version())
	require.Equal(t, uint64(20260715000001), migrations[3].Version())
	require.NotEmpty(t, migrations[0].Name())
}

func TestPhase4ScaffoldSubtasksCoverAllAnalyticsModels(t *testing.T) {
	metas := (ClaudeEnterprise{}).SubTaskMetas()
	require.Len(t, metas, 19)

	expectedRawTables := []string{
		"_raw_claude_enterprise_api_summaries",
		"_raw_claude_enterprise_api_users",
		"_raw_claude_enterprise_api_user_usage_report",
		"_raw_claude_enterprise_api_user_cost_report",
	}
	actualRawTables := make([]string, 0, len(expectedRawTables))
	for _, pair := range [][2]int{{0, 1}, {2, 3}, {5, 6}, {7, 8}} {
		i := pair[0]
		collectMeta := metas[i]
		extractMeta := metas[pair[1]]

		require.Equal(t, []string{plugin.DOMAIN_TYPE_CROSS}, collectMeta.DomainTypes)
		require.Equal(t, []string{plugin.DOMAIN_TYPE_CROSS}, extractMeta.DomainTypes)
		require.Len(t, collectMeta.ProductTables, 1)
		require.Equal(t, collectMeta.ProductTables, extractMeta.DependencyTables)
		expectedProductTables := []string{"_tool_claude_enterprise_analytics_records"}
		if collectMeta.Name == "collectSummaries" {
			expectedProductTables = append(expectedProductTables, "_tool_claude_enterprise_summaries")
		}
		if collectMeta.Name == "collectUserUsageReport" {
			expectedProductTables = append(expectedProductTables, "_tool_claude_enterprise_usage_reports")
		}
		if collectMeta.Name == "collectUserCostReport" {
			expectedProductTables = append(expectedProductTables, "_tool_claude_enterprise_cost_reports")
		}
		require.Equal(t, expectedProductTables, extractMeta.ProductTables)
		actualRawTables = append(actualRawTables, collectMeta.ProductTables[0])
	}
	require.Equal(t, "convertUserActivities", metas[4].Name)
	require.Equal(t, []string{"_tool_claude_enterprise_analytics_records"}, metas[4].DependencyTables)
	require.Equal(t, []string{"ai_activities"}, metas[4].ProductTables)
	require.ElementsMatch(t, expectedRawTables, actualRawTables)
}

// TestPhase14ExtendedEntitySubtasksAreIndependentlySelectable verifies the
// exit criterion for Phase 14: each of the five extended entities (skills,
// connectors, chat projects, plugins, artifacts) has its own uniquely named
// collect/extract subtask pair, its own raw table, and its own typed tool
// table, so a pipeline can select/run any one entity independently of the
// others via PipelineTask.Subtasks.
func TestPhase14ExtendedEntitySubtasksAreIndependentlySelectable(t *testing.T) {
	metas := (ClaudeEnterprise{}).SubTaskMetas()
	byName := make(map[string]plugin.SubTaskMeta, len(metas))
	for _, meta := range metas {
		byName[meta.Name] = meta
	}

	entities := []struct {
		collectName string
		extractName string
		rawTable    string
		toolTable   string
	}{
		{"collectSkills", "extractSkills", "_raw_claude_enterprise_api_skills", "_tool_claude_enterprise_skills"},
		{"collectConnectors", "extractConnectors", "_raw_claude_enterprise_api_connectors", "_tool_claude_enterprise_connectors"},
		{"collectChatProjects", "extractChatProjects", "_raw_claude_enterprise_api_chat_projects", "_tool_claude_enterprise_chat_projects"},
		{"collectPlugins", "extractPlugins", "_raw_claude_enterprise_api_plugins", "_tool_claude_enterprise_plugins"},
		{"collectArtifacts", "extractArtifacts", "_raw_claude_enterprise_api_artifacts", "_tool_claude_enterprise_artifacts"},
	}

	seenRawTables := make(map[string]bool)
	seenToolTables := make(map[string]bool)
	for _, entity := range entities {
		t.Run(entity.collectName, func(t *testing.T) {
			collectMeta, ok := byName[entity.collectName]
			require.True(t, ok, "missing collect subtask %s", entity.collectName)
			extractMeta, ok := byName[entity.extractName]
			require.True(t, ok, "missing extract subtask %s", entity.extractName)

			require.Equal(t, []string{plugin.DOMAIN_TYPE_CROSS}, collectMeta.DomainTypes)
			require.Equal(t, []string{plugin.DOMAIN_TYPE_CROSS}, extractMeta.DomainTypes)
			require.True(t, collectMeta.EnabledByDefault)
			require.True(t, extractMeta.EnabledByDefault)
			require.Equal(t, []string{entity.rawTable}, collectMeta.ProductTables)
			require.Equal(t, []string{entity.rawTable}, extractMeta.DependencyTables)
			require.Equal(t,
				[]string{"_tool_claude_enterprise_analytics_records", entity.toolTable},
				extractMeta.ProductTables,
			)

			require.False(t, seenRawTables[entity.rawTable], "raw table %s reused across entities", entity.rawTable)
			require.False(t, seenToolTables[entity.toolTable], "tool table %s reused across entities", entity.toolTable)
			seenRawTables[entity.rawTable] = true
			seenToolTables[entity.toolTable] = true
		})
	}
}

func TestPhase4ScaffoldMultiScopeIdentityIsExplicit(t *testing.T) {
	first := models.ClaudeEnterpriseScope{
		Scope:          scoped(1, 101),
		Id:             "scope_org_synthetic_001",
		OrganizationId: "org_synthetic_001",
		Name:           "Synthetic Org 1",
	}
	second := models.ClaudeEnterpriseScope{
		Scope:          scoped(1, 102),
		Id:             "scope_org_synthetic_002",
		OrganizationId: "org_synthetic_002",
		Name:           "Synthetic Org 2",
	}

	require.NotEqual(t, first.ScopeId(), second.ScopeId())
	require.Equal(t, uint64(1), first.ScopeConnectionId())
	require.Equal(t, uint64(101), first.ScopeScopeConfigId())

	firstParams, ok := first.ScopeParams().(*models.ClaudeEnterpriseScopeParams)
	require.True(t, ok)
	require.Equal(t, "scope_org_synthetic_001", firstParams.ScopeId)
	require.Equal(t, "org_synthetic_001", firstParams.OrganizationId)

	secondParams, ok := second.ScopeParams().(*models.ClaudeEnterpriseScopeParams)
	require.True(t, ok)
	require.Equal(t, "scope_org_synthetic_002", secondParams.ScopeId)
	require.Equal(t, "org_synthetic_002", secondParams.OrganizationId)
}

func tableNames(tablers []dal.Tabler) []string {
	names := make([]string, 0, len(tablers))
	for _, tabler := range tablers {
		names = append(names, tabler.TableName())
	}
	return names
}

func scoped(connectionId uint64, scopeConfigId uint64) common.Scope {
	return common.Scope{ConnectionId: connectionId, ScopeConfigId: scopeConfigId}
}
