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

package service

import (
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/require"
)

func rollupEvent(name string, minute int, attributes map[string]string, mutate func(*models.OtelEvent)) *models.OtelEvent {
	at := time.Date(2026, 11, 11, 10, minute, 0, 0, time.UTC)
	event := otelEventWith(name, "p1", at, int64(minute), attributes)
	if mutate != nil {
		mutate(event)
	}
	return event
}

func int64Ptr(value int64) *int64 { return &value }

func boolPtr(value bool) *bool { return &value }

func strPtr(value string) *string { return &value }

func TestBuildPromptRollupTools(t *testing.T) {
	result := func(minute int, tool, server string, success bool, duration int64) *models.OtelEvent {
		return rollupEvent(eventToolResult, minute, nil, func(e *models.OtelEvent) {
			e.ToolName, e.McpServerName, e.Success, e.DurationMs = tool, server, boolPtr(success), int64Ptr(duration)
		})
	}
	decision := func(minute int, tool, server, decisionValue, source string) *models.OtelEvent {
		return rollupEvent(eventToolDecision, minute, map[string]string{"decision": decisionValue, "source": source}, func(e *models.OtelEvent) {
			e.ToolName, e.McpServerName = tool, server
		})
	}
	rollup := buildPromptRollup(testOrganizationID, "p1", []*models.OtelEvent{
		rollupEvent(eventUserPrompt, 0, nil, nil),
		result(1, "Edit", "", true, 100),
		result(2, "Edit", "", false, 50),
		result(3, "Bash", "", true, 10),
		result(4, "search", "github", true, 700),
		decision(5, "Edit", "", "accept", "user_temporary"),
		decision(6, "Edit", "", "reject", "user_reject"),
		decision(7, "Bash", "", "reject", "config"),
		decision(8, "Bash", "", "accept", "config"),
		decision(9, "Ghost", "", "accept", "config"),
		decision(10, "search", "github", "accept", "user_permanent"),
	})
	type counts struct{ calls, failures, duration, configAccept, configReject, userAccept, userReject int64 }
	want := []struct {
		tool, server string
		counts
	}{
		{"Bash", "", counts{1, 0, 10, 1, 1, 0, 0}},
		{"Edit", "", counts{2, 1, 150, 0, 0, 1, 1}},
		{"Ghost", "", counts{0, 0, 0, 1, 0, 0, 0}},
		{"search", "github", counts{1, 0, 700, 0, 0, 1, 0}},
	}
	require.Len(t, rollup.tools, len(want))
	for index, row := range rollup.tools {
		got := counts{row.CallCount, row.FailureCount, row.DurationMs, row.ConfigAcceptCount, row.ConfigRejectCount, row.UserAcceptCount, row.UserRejectCount}
		require.Equal(t, want[index].tool, row.ToolName)
		require.Equal(t, want[index].server, row.McpServerName)
		require.Equal(t, want[index].counts, got, row.ToolName)
		require.Equal(t, rollup.prompt.Id, row.AiPromptId)
		require.Equal(t, "p1", row.PromptId)
		require.True(t, row.StartedAt.Equal(rollup.prompt.StartedAt))
		require.Equal(t, ai.CanonicalKey{Kind: ai.IDKindPromptTool, Provider: aiProviderClaude, WorkspaceKey: testOrganizationID, Grain: []string{"p1", row.ToolName, row.McpServerName}}.ID(), row.Id)
	}
	require.EqualValues(t, 4, rollup.prompt.ToolCallCount)
	require.EqualValues(t, 2, rollup.prompt.ToolRejectCount)
}

func TestBuildPromptRollupHookCounts(t *testing.T) {
	hook := func(minute int, hooks, blocking, errored, duration string) *models.OtelEvent {
		return rollupEvent(eventHookExecutionComplete, minute, map[string]string{
			"num_hooks": hooks, "num_blocking": blocking, "num_non_blocking_error": errored, "total_duration_ms": duration,
		}, nil)
	}
	rollup := buildPromptRollup(testOrganizationID, "p1", []*models.OtelEvent{
		rollupEvent(eventUserPrompt, 0, nil, nil),
		hook(1, "3", "1", "0", "120"),
		hook(2, "1", "0", "1", "30"),
	})
	prompt := rollup.prompt
	require.EqualValues(t, 4, prompt.HookCount)
	require.EqualValues(t, 1, prompt.HookBlockCount)
	require.EqualValues(t, 1, prompt.HookErrorCount)
	require.EqualValues(t, 150, prompt.HookDurationMs)
}

func TestBuildPromptRollupFirstMainThreadRequest(t *testing.T) {
	request := func(minute int, source string, input, cacheRead, cacheCreation int64, cost string) *models.OtelEvent {
		return rollupEvent(eventAPIRequest, minute, nil, func(e *models.OtelEvent) {
			e.QuerySource, e.InputTokens, e.CacheReadTokens, e.CacheCreationTokens, e.CostUsd = source, input, cacheRead, cacheCreation, strPtr(cost)
		})
	}
	rollup := buildPromptRollup(testOrganizationID, "p1", []*models.OtelEvent{
		rollupEvent(eventUserPrompt, 0, nil, nil),
		request(1, "subagent", 999, 999, 999, "9.0"),
		request(2, mainThreadQuerySource, 10, 200, 3000, "0.5"),
		request(3, mainThreadQuerySource, 1, 1, 1, "7"),
	})
	require.EqualValues(t, 3210, rollup.prompt.FirstRequestContextTokens)
	require.NotNil(t, rollup.prompt.FirstRequestCostUsd)
	require.Equal(t, "0.50000000", *rollup.prompt.FirstRequestCostUsd)
	require.NotNil(t, rollup.firstMainRequestAt)
	require.True(t, rollup.firstMainRequestAt.Equal(time.Date(2026, 11, 11, 10, 2, 0, 0, time.UTC)))

	none := buildPromptRollup(testOrganizationID, "p1", []*models.OtelEvent{
		rollupEvent(eventUserPrompt, 0, nil, nil),
		request(1, "subagent", 5, 5, 5, "1"),
	})
	require.Zero(t, none.prompt.FirstRequestContextTokens)
	require.Nil(t, none.prompt.FirstRequestCostUsd)
	require.Nil(t, none.firstMainRequestAt)

	headless := buildPromptRollup(testOrganizationID, "p1", []*models.OtelEvent{
		rollupEvent(eventUserPrompt, 0, nil, nil),
		request(1, "agent:custom", 5, 5, 5, "1"),
		request(2, sdkQuerySource, 40, 0, 2, "0.25"),
	})
	require.EqualValues(t, 42, headless.prompt.FirstRequestContextTokens)
	require.NotNil(t, headless.firstMainRequestAt)
	require.True(t, headless.firstMainRequestAt.Equal(time.Date(2026, 11, 11, 10, 2, 0, 0, time.UTC)))
}

func TestBuildSessionHooksGroupsRegistrations(t *testing.T) {
	registered := func(minute int, source, hookEvent, name string) *models.OtelEvent {
		return rollupEvent(eventHookRegistered, minute, map[string]string{
			"hook_source": source, "hook_event": hookEvent, "hook_name": name, "hook_type": "command",
		}, func(e *models.OtelEvent) { e.UserEmail = strPtr("a@example.com") })
	}
	target := &sessionTarget{connectionID: 7, userKey: "uuid:u1", sessionID: "sess-1"}
	hooks := buildSessionHooks(testOrganizationID, target, []*models.OtelEvent{
		registered(5, "userSettings", "PreToolUse", "lint"),
		registered(2, "userSettings", "PreToolUse", "lint"),
		registered(3, "projectSettings", "PreToolUse", "lint"),
		registered(4, "userSettings", "Stop", "lint"),
	})
	require.Len(t, hooks, 3)
	first := hooks[0]
	require.Equal(t, "userSettings", first.HookSource)
	require.True(t, first.FirstRegisteredAt.Equal(time.Date(2026, 11, 11, 10, 2, 0, 0, time.UTC)))
	require.Equal(t, "command", first.HookType)
	require.EqualValues(t, 7, first.SourceConnectionId)
	require.Equal(t, "a@example.com", first.UserEmail)
	require.Equal(t, ai.CanonicalKey{Kind: ai.IDKindSessionHook, Provider: aiProviderClaude, WorkspaceKey: testOrganizationID, Grain: []string{"sess-1", "userSettings", "PreToolUse", "lint"}}.ID(), first.Id)
	ids := map[string]struct{}{}
	for _, hook := range hooks {
		ids[hook.Id] = struct{}{}
	}
	require.Len(t, ids, 3)
}

func TestSessionTargetsFlagRegisteredHooks(t *testing.T) {
	registered := func(session string) preparedEvent {
		event := rollupEvent(eventHookRegistered, 1, nil, nil)
		event.SessionId = session
		return preparedEvent{event: event}
	}
	require.True(t, sessionTargets([]preparedEvent{registered("sess-1")})[0].hooksRegistered)
	require.False(t, sessionTargets([]preparedEvent{registered("")})[0].hooksRegistered)
}
