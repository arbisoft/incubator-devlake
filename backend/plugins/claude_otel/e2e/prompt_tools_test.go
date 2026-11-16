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
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
	"github.com/stretchr/testify/require"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
)

const toolsSession = "sess-tools-1"

// toolsSessionRecords is one session of two prompts two hours apart, with tools, decisions and hooks.
func toolsSessionRecords(who actor, t0 time.Time) []*logsv1.LogRecord {
	request := func(prompt string, at time.Time, sequence int64, source string, input, cacheRead, cacheCreation int64, cost string) *logsv1.LogRecord {
		return sessionRecord(who, toolsSession, prompt, "api_request", at, sequence,
			strAttr("query_source", source), strAttr("model", "claude-sonnet-5-5"),
			intAttr("input_tokens", input), intAttr("output_tokens", 5), intAttr("cache_read_tokens", cacheRead), intAttr("cache_creation_tokens", cacheCreation),
			strAttr("cost_usd", cost))
	}
	result := func(at time.Time, sequence int64, tool, server, success string, duration int64) *logsv1.LogRecord {
		extra := []*commonv1.KeyValue{strAttr("tool_name", tool), strAttr("success", success), intAttr("duration_ms", duration)}
		if server != "" {
			extra = append(extra, strAttr("mcp_server.name", server))
		}
		return sessionRecord(who, toolsSession, "p-tools-1", "tool_result", at, sequence, extra...)
	}
	decision := func(at time.Time, sequence int64, tool, decisionValue, source string) *logsv1.LogRecord {
		return sessionRecord(who, toolsSession, "p-tools-1", "tool_decision", at, sequence,
			strAttr("tool_name", tool), strAttr("decision", decisionValue), strAttr("source", source))
	}
	hook := func(at time.Time, sequence int64, hooks, blocking, errored, duration string) *logsv1.LogRecord {
		return sessionRecord(who, toolsSession, "p-tools-1", "hook_execution_complete", at, sequence,
			strAttr("num_hooks", hooks), strAttr("num_blocking", blocking), strAttr("num_non_blocking_error", errored), strAttr("total_duration_ms", duration))
	}
	registered := func(at time.Time, sequence int64, source, event, name string) *logsv1.LogRecord {
		return sessionRecord(who, toolsSession, "", "hook_registered", at, sequence,
			strAttr("hook_source", source), strAttr("hook_event", event), strAttr("hook_name", name), strAttr("hook_type", "command"))
	}
	s := time.Second
	return []*logsv1.LogRecord{
		sessionRecord(who, toolsSession, "p-tools-1", "user_prompt", t0, 1, intAttr("prompt_length", 10)),
		request("p-tools-1", t0.Add(5*s), 2, "subagent", 900, 900, 900, "9.0"),
		request("p-tools-1", t0.Add(6*s), 3, "repl_main_thread", 10, 200, 3000, "0.25"),
		request("p-tools-1", t0.Add(7*s), 4, "repl_main_thread", 1, 1, 1, "5.0"),
		result(t0.Add(8*s), 5, "Bash", "", "true", 100),
		result(t0.Add(9*s), 6, "Bash", "", "false", 50),
		result(t0.Add(10*s), 7, "search", "github", "true", 700),
		decision(t0.Add(11*s), 8, "Bash", "accept", "user_temporary"),
		decision(t0.Add(12*s), 9, "Bash", "reject", "user_reject"),
		decision(t0.Add(13*s), 10, "Bash", "reject", "config"),
		decision(t0.Add(14*s), 11, "Ghost", "accept", "config"),
		hook(t0.Add(15*s), 12, "3", "1", "0", "120"),
		hook(t0.Add(16*s), 13, "1", "0", "1", "30"),
		registered(t0.Add(-time.Minute), 0, "userSettings", "PreToolUse", "lint"),
		registered(t0.Add(-30*s), 14, "userSettings", "PreToolUse", "lint"),
		registered(t0.Add(-20*s), 15, "projectSettings", "PreToolUse", "lint"),

		sessionRecord(who, toolsSession, "p-tools-2", "user_prompt", t0.Add(2*time.Hour), 20, intAttr("prompt_length", 10)),
		request("p-tools-2", t0.Add(2*time.Hour+7*s), 21, "repl_main_thread", 20, 0, 0, "0.5"),
	}
}

type toolCounts struct{ calls, failures, duration, configAccept, configReject, userAccept, userReject int64 }

func TestPromptToolsHooksAndIdleRollup(t *testing.T) {
	w := newWorld(t)
	w.connection("alpha", orgR, w.day(-5))
	t0 := w.day(-2).Add(9 * time.Hour)
	w.insertLogRequest(&collectorlogs.ExportLogsServiceRequest{ResourceLogs: []*logsv1.ResourceLogs{clientLogResource(toolsSessionRecords(a1, t0)...)}})
	w.drainNow()

	tools := snapshot[ai.AiPromptTool](w, "prompt_id, tool_name, mcp_server_name", "workspace_key = ?", orgR)
	want := []struct {
		tool, server string
		counts       toolCounts
	}{
		{"Bash", "", toolCounts{2, 1, 150, 0, 1, 1, 1}},
		{"Ghost", "", toolCounts{0, 0, 0, 1, 0, 0, 0}},
		{"search", "github", toolCounts{1, 0, 700, 0, 0, 0, 0}},
	}
	require.Len(t, tools, len(want))
	for index, row := range tools {
		require.Equal(t, "p-tools-1", row.PromptId)
		require.Equal(t, want[index].tool, row.ToolName)
		require.Equal(t, want[index].server, row.McpServerName)
		require.Equal(t, want[index].counts, toolCounts{row.CallCount, row.FailureCount, row.DurationMs, row.ConfigAcceptCount, row.ConfigRejectCount, row.UserAcceptCount, row.UserRejectCount}, row.ToolName)
		require.Equal(t, a1.logUserKey(), row.UserKey)
		require.Equal(t, toolsSession, row.SessionId)
		require.True(t, row.StartedAt.Equal(t0), "started_at = %s", row.StartedAt)
	}

	prompts := make(map[string]ai.AiPrompt)
	for _, prompt := range snapshot[ai.AiPrompt](w, "prompt_id", "workspace_key = ?", orgR) {
		prompts[prompt.PromptId] = prompt
	}
	first, second := prompts["p-tools-1"], prompts["p-tools-2"]
	require.EqualValues(t, 4, first.HookCount)
	require.EqualValues(t, 1, first.HookBlockCount)
	require.EqualValues(t, 1, first.HookErrorCount)
	require.EqualValues(t, 150, first.HookDurationMs)
	require.Nil(t, first.IdleBeforeSeconds)
	require.NotNil(t, second.IdleBeforeSeconds)
	require.EqualValues(t, 7200, *second.IdleBeforeSeconds)
	require.EqualValues(t, 3210, first.FirstRequestContextTokens)
	require.NotNil(t, first.FirstRequestCostUsd)
	require.Equal(t, "0.25000000", *first.FirstRequestCostUsd)
	require.EqualValues(t, 20, second.FirstRequestContextTokens)
	require.Zero(t, second.HookCount)

	hooks := snapshot[ai.AiSessionHook](w, "hook_source", "workspace_key = ?", orgR)
	require.Len(t, hooks, 2)
	require.Equal(t, "projectSettings", hooks[0].HookSource)
	require.Equal(t, "userSettings", hooks[1].HookSource)
	require.Equal(t, "PreToolUse", hooks[1].HookEvent)
	require.Equal(t, "lint", hooks[1].HookName)
	require.Equal(t, "command", hooks[1].HookType)
	require.Equal(t, toolsSession, hooks[1].SessionId)
	require.Equal(t, a1.logUserKey(), hooks[1].UserKey)
	require.True(t, hooks[1].FirstRegisteredAt.Equal(t0.Add(-time.Minute)), "first_registered_at = %s", hooks[1].FirstRegisteredAt)
}

func TestPromptToolsAndHooksReplayIsIdentical(t *testing.T) {
	w := newWorld(t)
	w.connection("alpha", orgR, w.day(-5))
	t0 := w.day(-2).Add(9 * time.Hour)
	w.insertLogRequest(&collectorlogs.ExportLogsServiceRequest{ResourceLogs: []*logsv1.ResourceLogs{clientLogResource(toolsSessionRecords(a1, t0)...)}})
	w.drainNow()
	before := w.logFactsOf(0, orgR)
	before.Events = nil
	require.Len(t, before.Tool, 3)
	require.Len(t, before.Hook, 2)

	_, err := service.CreateOtelReplay(e2eUser, &service.OtelReplayInput{OtelReplayRange: w.replayDates(-2, -2)})
	require.NoError(t, err)
	w.drainNow()

	after := w.logFactsOf(0, orgR)
	after.Events = nil
	require.Equal(t, before, after)
	w.requireLogReplayCompleted(1)
}
