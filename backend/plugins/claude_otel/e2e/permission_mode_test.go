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
	"encoding/json"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
	"github.com/stretchr/testify/require"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
)

// clientLogResource wraps hand-built records in a v2.1.301 client resource.
func clientLogResource(records ...*logsv1.LogRecord) *logsv1.ResourceLogs {
	return &logsv1.ResourceLogs{
		Resource: &resourcev1.Resource{Attributes: []*commonv1.KeyValue{
			strAttr("service.name", "claude-code"),
			strAttr("service.version", "2.1.301"),
		}},
		ScopeLogs: []*logsv1.ScopeLogs{{Scope: &commonv1.InstrumentationScope{Name: "com.anthropic.claude_code.events", Version: "2.1.301"}, LogRecords: records}},
	}
}

// sessionRecord builds one log record with the base attributes logResource sets; an empty prompt sends no prompt.id.
func sessionRecord(who actor, session, prompt, name string, at time.Time, sequence int64, extra ...*commonv1.KeyValue) *logsv1.LogRecord {
	base := []*commonv1.KeyValue{
		strAttr("devlake_team", who.team),
		strAttr("event.name", name),
		intAttr("event.sequence", sequence),
		strAttr("session.id", session),
		strAttr("organization.id", who.org),
		strAttr("user.account_uuid", "uuid-"+who.name),
		strAttr("user.email", who.email()),
		strAttr("user.id", "install-"+who.name),
		strAttr("event.timestamp", at.UTC().Format("2006-01-02T15:04:05.000Z")),
	}
	if prompt != "" {
		base = append(base, strAttr("prompt.id", prompt))
	}
	return &logsv1.LogRecord{Body: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: "claude_code." + name}}, Attributes: withAttrs(base, extra...)}
}

type promptModeState struct {
	mode     string
	inferred bool
}

// promptModes maps each of the organization's prompt IDs to its permission mode state.
func (w *world) promptModes(org string) map[string]promptModeState {
	w.t.Helper()
	modes := make(map[string]promptModeState)
	for _, prompt := range snapshot[ai.AiPrompt](w, "prompt_id", "workspace_key = ?", org) {
		modes[prompt.PromptId] = promptModeState{mode: prompt.PermissionMode, inferred: prompt.PermissionModeInferred}
	}
	return modes
}

func TestObservedPermissionModeRollupRefreshAndReplay(t *testing.T) {
	w := newWorld(t)
	w.connection("alpha", orgR, w.day(-5))
	const session = "sess-mode-1"
	who := a1
	t0 := w.day(-2).Add(9 * time.Hour)
	send := func(records ...*logsv1.LogRecord) {
		w.insertLogRequest(&collectorlogs.ExportLogsServiceRequest{ResourceLogs: []*logsv1.ResourceLogs{clientLogResource(records...)}})
		w.drainNow()
	}

	send(
		sessionRecord(who, session, "p-mode-1", "user_prompt", t0, 1, intAttr("prompt_length", 12)),
		sessionRecord(who, session, "p-mode-1", "tool_decision", t0.Add(10*time.Second), 2,
			strAttr("permission_mode", "auto"), strAttr("tool_name", "Bash"), strAttr("decision", "accept"), strAttr("source", "config")),
		sessionRecord(who, session, "p-mode-0", "user_prompt", t0.Add(-5*time.Minute), 0, intAttr("prompt_length", 12)),
	)
	modes := w.promptModes(orgR)
	require.Equal(t, promptModeState{mode: "auto"}, modes["p-mode-1"])
	require.Equal(t, promptModeState{mode: ai.PermissionModeDefault, inferred: true}, modes["p-mode-0"])

	send(sessionRecord(who, session, "p-mode-2", "user_prompt", t0.Add(5*time.Minute), 3, intAttr("prompt_length", 12)))
	require.Equal(t, promptModeState{mode: "auto"}, w.promptModes(orgR)["p-mode-2"])

	send(sessionRecord(who, session, "", "permission_mode_changed", t0.Add(2*time.Minute), 4,
		strAttr("from_mode", "default"), strAttr("to_mode", "plan"), strAttr("trigger", "shift_tab")))
	// The change's from_mode differs from the observed mode, so the refresh must keep the observation.
	modes = w.promptModes(orgR)
	require.Equal(t, promptModeState{mode: "auto"}, modes["p-mode-1"])
	require.Equal(t, promptModeState{mode: "plan"}, modes["p-mode-2"])
	require.Equal(t, promptModeState{mode: ai.PermissionModeDefault}, modes["p-mode-0"])
	want := modes

	// Rows written before the mode was kept carry neither the attribute nor a derived mode.
	require.NoError(t, w.tester.Dal.Exec("UPDATE "+models.OtelEventTable+" SET attributes = JSON_REMOVE(attributes, '$.permission_mode') WHERE session_id = ? AND event_name = ?", session, "tool_decision"))
	require.NoError(t, w.tester.Dal.UpdateColumns(&ai.AiPrompt{}, []dal.DalSet{
		{ColumnName: "permission_mode", Value: ai.PermissionModeDefault},
		{ColumnName: "permission_mode_inferred", Value: true},
	}, dal.Where("workspace_key = ?", orgR)))

	_, err := service.CreateOtelReplay(e2eUser, &service.OtelReplayInput{OtelReplayRange: w.replayDates(-2, -2)})
	require.NoError(t, err)
	w.drainNow()

	decisions := snapshot[models.OtelEvent](w, "event_key", "session_id = ? AND event_name = ?", session, "tool_decision")
	require.Len(t, decisions, 1)
	var attributes map[string]interface{}
	require.NoError(t, json.Unmarshal(decisions[0].Attributes, &attributes))
	require.Equal(t, "auto", attributes["permission_mode"])
	require.Equal(t, want, w.promptModes(orgR))
	w.requireLogReplayCompleted(3)
}
