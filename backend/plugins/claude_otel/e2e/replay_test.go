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
	"math/big"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	"github.com/apache/incubator-devlake/helpers/e2ehelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/plugins/claude_otel/impl"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
	"github.com/stretchr/testify/require"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
)

const (
	dateLayout              = "2006-01-02"
	resourcesSkippedCode    = "resources_skipped"
	hourlyActivityOrder     = "connection_id, user_key, hour_start, repository_url"
	hourlyModelOrder        = "connection_id, user_key, hour_start, model, query_source, effort, agent_name, skill_name, repository_url"
	hourlyToolOrder         = "connection_id, user_key, hour_start, tool_name, language, decision_source, repository_url"
	hourlySessionStartOrder = "connection_id, user_key, hour_start, session_id, start_type, repository_url"
	canonicalActivityOrder  = "workspace_key, user_key, date, type, interface_type, repository_url"
	canonicalModelOrder     = "workspace_key, user_key, date, model, repository_url"
	canonicalToolOrder      = "workspace_key, user_key, date, tool_name, repository_url"
)

var e2eUser = &common.User{Name: "E2E", Email: "e2e@example.com"}

// world is one test's database, clock anchors and service wiring.
type world struct {
	t       *testing.T
	tester  *e2ehelper.DataFlowTester
	drainer *service.ConverterDrainer
	today   time.Time
	now     time.Time
}

func newWorld(t *testing.T) *world {
	tester := e2ehelper.NewDataFlowTester(t, "claude_otel", impl.ClaudeOtel{})
	service.Init(contextimpl.NewDefaultBasicRes(tester.Cfg, tester.Log, tester.Dal))
	drainer := service.NewConverterDrainer()
	for _, table := range models.GetTablesInfo() {
		tester.FlushTabler(table)
	}
	for _, table := range []dal.Tabler{&ai.AiActivity{}, &ai.AiModelUsage{}, &ai.AiToolDecision{}, &ai.AiSourcePreference{}, &ai.AiPrompt{}, &ai.AiPromptSkill{}, &ai.AiPromptFailure{}, &ai.AiPermissionModeChange{}, &ai.AiPromptTool{}, &ai.AiSessionHook{}, &crossdomain.Account{}} {
		tester.FlushTabler(table)
	}
	now := time.Now().UTC()
	return &world{t: t, tester: tester, drainer: drainer, today: now.Truncate(24 * time.Hour), now: now}
}

func (w *world) day(offset int) time.Time { return w.today.AddDate(0, 0, offset) }

func (w *world) drain(at time.Time) {
	require.NoError(w.t, w.drainer.Drain(at))
}

func (w *world) drainNow()           { w.drain(time.Now().UTC()) }
func (w *world) drainAfterMidnight() { w.drain(w.today.Add(24*time.Hour + 5*time.Second)) }

func (w *world) count(model interface{}, where string, args ...interface{}) int64 {
	n, err := w.tester.Dal.Count(dal.From(model), dal.Where(where, args...))
	require.NoError(w.t, err)
	return n
}

// snapshot loads a table's rows in natural-key order with id, timestamps and raw-data fields zeroed.
func snapshot[T any](w *world, order, where string, args ...interface{}) []T {
	rows := make([]T, 0)
	var model T
	require.NoError(w.t, w.tester.Dal.All(&rows, dal.From(&model), dal.Where(where, args...), dal.Orderby(order)))
	for i := range rows {
		clearVolatile(reflect.ValueOf(&rows[i]).Elem())
	}
	return rows
}

func clearVolatile(v reflect.Value) {
	for i := 0; i < v.NumField(); i++ {
		field, name := v.Field(i), v.Type().Field(i)
		switch {
		case name.Anonymous && field.Kind() == reflect.Struct:
			clearVolatile(field)
		case name.Name == "Id" || name.Name == "CreatedAt" || name.Name == "UpdatedAt" || strings.HasPrefix(name.Name, "RawData"):
			field.Set(reflect.Zero(field.Type()))
		}
	}
}

// facts is every hourly and canonical row one connection produced.
type facts struct {
	Activity     []models.OtelHourlyActivity
	Model        []models.OtelHourlyModelUsage
	Tool         []models.OtelHourlyToolUsage
	SessionStart []models.OtelHourlySessionStart
	AiActivity   []ai.AiActivity
	AiModel      []ai.AiModelUsage
	AiTool       []ai.AiToolDecision
}

func (w *world) factsOf(connectionID uint64) facts {
	return facts{
		Activity:     snapshot[models.OtelHourlyActivity](w, hourlyActivityOrder, "connection_id = ?", connectionID),
		Model:        snapshot[models.OtelHourlyModelUsage](w, hourlyModelOrder, "connection_id = ?", connectionID),
		Tool:         snapshot[models.OtelHourlyToolUsage](w, hourlyToolOrder, "connection_id = ?", connectionID),
		SessionStart: snapshot[models.OtelHourlySessionStart](w, hourlySessionStartOrder, "connection_id = ?", connectionID),
		AiActivity:   snapshot[ai.AiActivity](w, canonicalActivityOrder, "source_connection_id = ?", connectionID),
		AiModel:      snapshot[ai.AiModelUsage](w, canonicalModelOrder, "source_connection_id = ?", connectionID),
		AiTool:       snapshot[ai.AiToolDecision](w, canonicalToolOrder, "source_connection_id = ?", connectionID),
	}
}

func requireFilled(t *testing.T, f facts) {
	require.NotEmpty(t, f.Activity)
	require.NotEmpty(t, f.Model)
	require.NotEmpty(t, f.Tool)
	require.NotEmpty(t, f.SessionStart)
	require.NotEmpty(t, f.AiActivity)
	require.NotEmpty(t, f.AiModel)
	require.NotEmpty(t, f.AiTool)
	require.True(t, slices.ContainsFunc(f.Model, func(row models.OtelHourlyModelUsage) bool { return row.Effort != "" }))
	require.True(t, slices.ContainsFunc(f.Model, func(row models.OtelHourlyModelUsage) bool { return row.AgentName != "" }))
	require.True(t, slices.ContainsFunc(f.Tool, func(row models.OtelHourlyToolUsage) bool { return row.DecisionSource != "" }))
	require.True(t, slices.ContainsFunc(f.SessionStart, func(row models.OtelHourlySessionStart) bool { return row.SessionId != "" }))
	var starts, sessions int64
	for _, row := range f.SessionStart {
		starts += row.StartCount
	}
	for _, row := range f.Activity {
		sessions += row.SessionCount
	}
	require.Equal(t, sessions, starts)
}

// userKeys lists the distinct developers across every row of the set.
func (f facts) userKeys() map[string]struct{} {
	keys := make(map[string]struct{})
	for _, row := range f.Activity {
		keys[row.UserKey] = struct{}{}
	}
	for _, row := range f.Model {
		keys[row.UserKey] = struct{}{}
	}
	for _, row := range f.Tool {
		keys[row.UserKey] = struct{}{}
	}
	for _, row := range f.SessionStart {
		keys[row.UserKey] = struct{}{}
	}
	for _, row := range f.AiActivity {
		keys[*row.UserKey] = struct{}{}
	}
	for _, row := range f.AiModel {
		keys[row.UserKey] = struct{}{}
	}
	for _, row := range f.AiTool {
		keys[row.UserKey] = struct{}{}
	}
	return keys
}

// organizations lists the distinct organizations across every row of the set.
func (f facts) organizations() map[string]struct{} {
	orgs := make(map[string]struct{})
	for _, row := range f.Activity {
		orgs[*row.OrganizationId] = struct{}{}
	}
	for _, row := range f.Model {
		orgs[*row.OrganizationId] = struct{}{}
	}
	for _, row := range f.Tool {
		orgs[*row.OrganizationId] = struct{}{}
	}
	for _, row := range f.SessionStart {
		orgs[*row.OrganizationId] = struct{}{}
	}
	for _, row := range f.AiActivity {
		orgs[*row.WorkspaceKey] = struct{}{}
	}
	for _, row := range f.AiModel {
		orgs[row.WorkspaceKey] = struct{}{}
	}
	for _, row := range f.AiTool {
		orgs[row.WorkspaceKey] = struct{}{}
	}
	return orgs
}

func (w *world) replayDates(from, to int) service.OtelReplayRange {
	return service.OtelReplayRange{StartDate: w.day(from).Format(dateLayout), EndDate: w.day(to).Format(dateLayout)}
}

func (w *world) rebind(connection *models.OtelConnection, org string, replay service.OtelReplayRange) {
	_, err := service.RebindOtelOrganization(e2eUser, connection.ID, &service.OtelRebindInput{OrganizationId: org, Replay: &replay})
	require.NoError(w.t, err)
}

func (w *world) requireBatchDiagnostics(batches []*models.OtelMetricBatch, code string) {
	for _, stored := range batches {
		rows := snapshot[models.OtelMetricBatch](w, "id", "id = ?", stored.ID)
		require.Len(w.t, rows, 1)
		require.Equal(w.t, models.OtelBatchStatusProcessed, rows[0].Status, "batch %d", stored.ID)
		if code == "" {
			require.Nil(w.t, rows[0].ProcessingErrorCode, "batch %d", stored.ID)
			continue
		}
		require.NotNil(w.t, rows[0].ProcessingErrorCode, "batch %d", stored.ID)
		require.Equal(w.t, code, *rows[0].ProcessingErrorCode, "batch %d", stored.ID)
	}
}

func (w *world) requireReplaysCompleted() []models.OtelReplayRequest {
	requests := snapshot[models.OtelReplayRequest](w, "id", "1 = 1")
	require.NotEmpty(w.t, requests)
	for _, request := range requests {
		require.Equal(w.t, models.OtelReplayRequestStatusCompleted, request.Status)
		if request.Kind == models.OtelReplayKindMetrics {
			require.Greater(w.t, request.ReplayedBatches, 0)
		}
	}
	return requests
}

// logFacts is every event and prompt row the log converter wrote for one connection.
type logFacts struct {
	Events  []models.OtelEvent
	Prompt  []ai.AiPrompt
	Skill   []ai.AiPromptSkill
	Failure []ai.AiPromptFailure
	Mode    []ai.AiPermissionModeChange
	Tool    []ai.AiPromptTool
	Hook    []ai.AiSessionHook
}

// requireLogsOn asserts the connection has events, and the organization has prompts, for one user on one UTC day.
func (w *world) requireLogsOn(connectionID uint64, org string, who actor, day time.Time) {
	w.t.Helper()
	next := day.AddDate(0, 0, 1)
	require.Positive(w.t, w.count(&models.OtelEvent{}, "connection_id = ? AND organization_id = ? AND user_key = ? AND event_timestamp >= ? AND event_timestamp < ?", connectionID, org, who.logUserKey(), day, next), "%s %s", who.name, day.Format(dateLayout))
	require.Positive(w.t, w.count(&ai.AiPrompt{}, "workspace_key = ? AND user_key = ? AND started_at >= ? AND started_at < ?", org, who.logUserKey(), day, next), "%s %s", who.name, day.Format(dateLayout))
	// A converted prompt carries the effort its main-thread request reported, or its only
	// request's, and NULL when its requests reported none.
	for _, prompt := range snapshot[ai.AiPrompt](w, "prompt_id", "workspace_key = ? AND user_key = ? AND started_at >= ? AND started_at < ?", org, who.logUserKey(), day, next) {
		require.Equal(w.t, fxPromptEffort(who.promptSeed(w.t, prompt.PromptId)), promptEffort(w.t, prompt), prompt.PromptId)
	}
}

// promptEffort is the prompt's effort, or "" when it is NULL. It fails on a stored empty
// effort, which would read as a level rather than as no effort.
func promptEffort(t *testing.T, prompt ai.AiPrompt) string {
	t.Helper()
	if prompt.Effort == nil {
		return ""
	}
	require.NotEmpty(t, *prompt.Effort, "%s stored an empty effort instead of NULL", prompt.PromptId)
	return *prompt.Effort
}

func (w *world) logFactsOf(connectionID uint64, org string) logFacts {
	return logFacts{
		Events:  snapshot[models.OtelEvent](w, "event_key", "connection_id = ?", connectionID),
		Prompt:  snapshot[ai.AiPrompt](w, "workspace_key, prompt_id", "workspace_key = ?", org),
		Skill:   snapshot[ai.AiPromptSkill](w, "workspace_key, prompt_id, skill_name", "workspace_key = ?", org),
		Failure: snapshot[ai.AiPromptFailure](w, "workspace_key, prompt_id, id", "workspace_key = ?", org),
		Mode:    snapshot[ai.AiPermissionModeChange](w, "workspace_key, session_id, changed_at", "workspace_key = ?", org),
		Tool:    snapshot[ai.AiPromptTool](w, "workspace_key, prompt_id, tool_name, mcp_server_name", "workspace_key = ?", org),
		Hook:    snapshot[ai.AiSessionHook](w, "workspace_key, session_id, hook_source, hook_event, hook_name", "workspace_key = ?", org),
	}
}

// base is the shared fixture: three connections, nine mixed batches, one mis-bound team.
type base struct {
	a, b, c *models.OtelConnection
	batches []*models.OtelMetricBatch
}

func (w *world) seedBase(aCreatedAt time.Time) base {
	created := w.day(-3)
	fixture := base{
		a: w.connection("alpha", orgW, aCreatedAt),
		b: w.connection("beta", orgB, created),
		c: w.connection("gamma", orgC, created),
	}
	fixture.batches = w.seedBatches(baseLayout, w.day(-2), w.day(-1), w.today)
	return fixture
}

// reboundBase converts the base fixture, rebinds A to R with a replay of all fixture days and runs it.
func (w *world) reboundBase() (base, facts, facts) {
	fixture := w.seedBase(w.day(-3))
	w.drainNow()
	beforeB, beforeC := w.factsOf(fixture.b.ID), w.factsOf(fixture.c.ID)
	requireFilled(w.t, beforeB)
	requireFilled(w.t, beforeC)
	w.rebind(fixture.a, orgR, w.replayDates(-2, 0))
	w.drainNow()
	w.drainAfterMidnight()
	return fixture, beforeB, beforeC
}

func TestReplayBaselineDropsMismatchedOrganization(t *testing.T) {
	w := newWorld(t)
	fixture := w.seedBase(w.day(-3))
	w.drainNow()

	factsA := w.factsOf(fixture.a.ID)
	requireFilled(t, factsA)
	require.Equal(t, map[string]struct{}{stray.userKey(): {}}, factsA.userKeys())
	require.Equal(t, map[string]struct{}{orgW: {}}, factsA.organizations())
	w.requireBatchDiagnostics(fixture.batches, resourcesSkippedCode)
}

func TestRebindAndReplayRebuildsOnlyTheReboundTeam(t *testing.T) {
	w := newWorld(t)
	fixture, beforeB, beforeC := w.reboundBase()

	require.Equal(t, beforeB, w.factsOf(fixture.b.ID))
	require.Equal(t, beforeC, w.factsOf(fixture.c.ID))

	for _, who := range []actor{a1, a2, a3, a4, a5, sharedA} {
		for offset := -2; offset <= 0; offset++ {
			day := w.day(offset)
			end := day.AddDate(0, 0, 1)
			require.Positive(t, w.count(&models.OtelHourlyActivity{}, "connection_id = ? AND organization_id = ? AND user_key = ? AND hour_start >= ? AND hour_start < ?", fixture.a.ID, orgR, who.userKey(), day, end), "%s %s", who.name, day.Format(dateLayout))
			require.Equal(t, int64(1), w.count(&ai.AiActivity{}, "workspace_key = ? AND user_key = ? AND date = ? AND repository_url = ?", orgR, who.userKey(), day.Format(dateLayout), ""), "%s %s", who.name, day.Format(dateLayout))
		}
	}
	require.Equal(t, int64(1), w.count(&models.OtelAuditEvent{}, "action = ? AND connection_id = ?", models.OtelAuditActionOrganizationRebind, fixture.a.ID))
	require.Equal(t, int64(1), w.count(&models.OtelAuditEvent{}, "action = ? AND connection_id = ?", models.OtelAuditActionReplayRequested, fixture.a.ID))

	require.Zero(t, w.count(&models.OtelHourlyActivity{}, "connection_id = ? AND user_key = ?", fixture.a.ID, stray.userKey()))
	require.Zero(t, w.count(&models.OtelHourlyModelUsage{}, "connection_id = ? AND user_key = ?", fixture.a.ID, stray.userKey()))
	require.Zero(t, w.count(&models.OtelHourlyToolUsage{}, "connection_id = ? AND user_key = ?", fixture.a.ID, stray.userKey()))
	require.Zero(t, w.count(&models.OtelHourlySessionStart{}, "connection_id = ? AND user_key = ?", fixture.a.ID, stray.userKey()))
	require.Zero(t, w.count(&ai.AiActivity{}, "user_key = ? AND workspace_key = ?", stray.userKey(), orgW))
	require.Zero(t, w.count(&ai.AiModelUsage{}, "user_key = ? AND workspace_key = ?", stray.userKey(), orgW))
	require.Zero(t, w.count(&ai.AiToolDecision{}, "user_key = ? AND workspace_key = ?", stray.userKey(), orgW))

	require.Contains(t, beforeB.userKeys(), sharedB.userKey())
	for offset := -2; offset <= 0; offset++ {
		w.requireSharedCanonicalMatchesHourly(fixture.a.ID, w.day(offset))
	}
	w.requireReplaysCompleted()
}

// requireSharedCanonicalMatchesHourly checks the shared developer's R canonical rows against the sum of their A hourly rows.
func (w *world) requireSharedCanonicalMatchesHourly(connectionID uint64, day time.Time) {
	t := w.t
	key, end := sharedA.userKey(), day.AddDate(0, 0, 1)
	hourly := "connection_id = ? AND organization_id = ? AND user_key = ? AND hour_start >= ? AND hour_start < ?"
	canonical := "workspace_key = ? AND user_key = ? AND date = ?"
	label := day.Format(dateLayout)

	type activitySums struct{ sessions, added, removed, commits, prs int }
	wantActivity := make(map[string]activitySums)
	for _, row := range snapshot[models.OtelHourlyActivity](w, hourlyActivityOrder, hourly, connectionID, orgR, key, day, end) {
		sum := wantActivity[row.RepositoryUrl]
		wantActivity[row.RepositoryUrl] = activitySums{sum.sessions + int(row.SessionCount), sum.added + int(row.LinesAdded), sum.removed + int(row.LinesRemoved), sum.commits + int(row.CommitsCreated), sum.prs + int(row.PrsCreated)}
	}
	gotActivity := make(map[string]activitySums)
	for _, row := range snapshot[ai.AiActivity](w, canonicalActivityOrder, canonical, orgR, key, label) {
		require.NotNil(t, row.RepositoryUrl, label)
		require.NotContains(t, gotActivity, *row.RepositoryUrl, "%s: more than one canonical row for a repository", label)
		gotActivity[*row.RepositoryUrl] = activitySums{row.NumSessions, row.LinesAdded, row.LinesRemoved, row.CommitsCreated, row.PrsCreated}
	}
	require.NotEmpty(t, wantActivity, label)
	require.Equal(t, wantActivity, gotActivity, label)

	type usage struct {
		input, output, cacheRead, cacheCreation int64
		cost                                    *big.Rat
	}
	type usageKey struct{ model, repository string }
	wantUsage := make(map[usageKey]*usage)
	for _, row := range snapshot[models.OtelHourlyModelUsage](w, hourlyModelOrder, hourly, connectionID, orgR, key, day, end) {
		id := usageKey{row.Model, row.RepositoryUrl}
		sum := wantUsage[id]
		if sum == nil {
			sum = &usage{cost: new(big.Rat)}
			wantUsage[id] = sum
		}
		cost, ok := new(big.Rat).SetString(row.EstimatedCostUSD)
		require.True(t, ok)
		sum.input += row.InputTokens
		sum.output += row.OutputTokens
		sum.cacheRead += row.CacheReadTokens
		sum.cacheCreation += row.CacheCreationTokens
		sum.cost.Add(sum.cost, cost)
	}
	gotUsage := make(map[usageKey]*usage)
	for _, row := range snapshot[ai.AiModelUsage](w, canonicalModelOrder, canonical, orgR, key, label) {
		require.NotNil(t, row.RepositoryUrl, label)
		cost, ok := new(big.Rat).SetString(row.EstimatedCostUsd)
		require.True(t, ok)
		gotUsage[usageKey{row.Model, *row.RepositoryUrl}] = &usage{row.InputTokens, row.OutputTokens, row.CacheReadTokens, row.CacheCreationTokens, cost}
	}
	require.NotEmpty(t, wantUsage, label)
	require.Equal(t, len(wantUsage), len(gotUsage), label)
	for id, want := range wantUsage {
		got := gotUsage[id]
		require.NotNil(t, got, "%s %v", label, id)
		require.Equal(t, []int64{want.input, want.output, want.cacheRead, want.cacheCreation}, []int64{got.input, got.output, got.cacheRead, got.cacheCreation}, "%s %v", label, id)
		require.Zero(t, want.cost.Cmp(got.cost), "%s %v cost %s vs %s", label, id, want.cost.FloatString(8), got.cost.FloatString(8))
	}

	type decisions struct{ accepted, rejected int64 }
	wantTools := make(map[usageKey]decisions)
	for _, row := range snapshot[models.OtelHourlyToolUsage](w, hourlyToolOrder, hourly, connectionID, orgR, key, day, end) {
		id := usageKey{row.ToolName, row.RepositoryUrl}
		sum := wantTools[id]
		wantTools[id] = decisions{sum.accepted + row.AcceptedCount, sum.rejected + row.RejectedCount}
	}
	gotTools := make(map[usageKey]decisions)
	for _, row := range snapshot[ai.AiToolDecision](w, canonicalToolOrder, canonical, orgR, key, label) {
		require.NotNil(t, row.RepositoryUrl, label)
		gotTools[usageKey{row.ToolName, *row.RepositoryUrl}] = decisions{row.AcceptedCount, row.RejectedCount}
	}
	require.NotEmpty(t, wantTools, label)
	require.Equal(t, wantTools, gotTools, label)
}

func TestReplayIncludingTodayWaitsForMidnight(t *testing.T) {
	w := newWorld(t)
	fixture := w.seedBase(w.day(-45))
	w.drainNow()
	w.rebind(fixture.a, orgR, w.replayDates(-40, 0))
	w.drainNow()

	requests := snapshot[models.OtelReplayRequest](w, "id", "1 = 1")
	require.Len(t, requests, 4)
	wantKinds := []string{models.OtelReplayKindMetrics, models.OtelReplayKindLogs, models.OtelReplayKindMetrics, models.OtelReplayKindLogs}
	for index, request := range requests {
		require.Equal(t, wantKinds[index], request.Kind)
	}
	require.Equal(t, models.OtelReplayRequestStatusCompleted, requests[0].Status)
	require.Equal(t, models.OtelReplayRequestStatusCompleted, requests[1].Status)
	require.Equal(t, models.OtelReplayRequestStatusPending, requests[2].Status)
	require.Equal(t, models.OtelReplayRequestStatusCompleted, requests[3].Status)
	require.True(t, requests[0].RangeEnd.Before(w.today))
	require.True(t, requests[2].RangeEnd.After(w.today))
	page, err := service.ListOtelReplays(1, 100)
	require.NoError(t, err)
	states := make(map[uint64]service.OtelReplayState)
	for _, replay := range page.Replays {
		states[replay.Id] = replay.State
	}
	require.Equal(t, map[uint64]service.OtelReplayState{
		requests[0].ID: service.OtelReplayStateCompleted,
		requests[1].ID: service.OtelReplayStateCompleted,
		requests[2].ID: service.OtelReplayStateWaiting,
		requests[3].ID: service.OtelReplayStateCompleted,
	}, states)

	w.drainAfterMidnight()
	requests = w.requireReplaysCompletedAfterSplit()
	require.Zero(t, requests[0].ReplayedBatches)
}

func (w *world) requireReplaysCompletedAfterSplit() []models.OtelReplayRequest {
	requests := snapshot[models.OtelReplayRequest](w, "id", "1 = 1")
	require.Len(w.t, requests, 4)
	for _, request := range requests {
		require.Equal(w.t, models.OtelReplayRequestStatusCompleted, request.Status)
	}
	require.Greater(w.t, requests[2].ReplayedBatches, 0)
	return requests
}

func TestReplayIsIdempotent(t *testing.T) {
	w := newWorld(t)
	fixture, _, _ := w.reboundBase()
	before := []facts{w.factsOf(fixture.a.ID), w.factsOf(fixture.b.ID), w.factsOf(fixture.c.ID)}
	for _, set := range before {
		requireFilled(t, set)
	}

	_, err := service.CreateOtelReplay(e2eUser, &service.OtelReplayInput{OtelReplayRange: w.replayDates(-2, -1)})
	require.NoError(t, err)
	w.drainNow()

	require.Equal(t, before, []facts{w.factsOf(fixture.a.ID), w.factsOf(fixture.b.ID), w.factsOf(fixture.c.ID)})
	w.requireReplaysCompleted()
}

func TestRebindRevokedConnectionRecoversItsLivePeriod(t *testing.T) {
	w := newWorld(t)
	revokedAt := w.day(-1)
	revoked := w.connection("delta", orgW, w.day(-3))
	revoked.Status = models.OtelConnectionStatusRevoked
	revoked.RevokedAt = &revokedAt
	require.NoError(t, w.tester.Dal.Update(revoked))
	successor := w.connection("delta", orgR, revokedAt)

	delta := [][]actor{{d1, d2}, {d1}}
	deltaTwo := [][]actor{{d3, d4}, {d3}}
	batchesD := w.seedBatches(delta, w.day(-2))
	batchesD2 := w.seedBatches(deltaTwo, w.day(-1))
	w.drainNow()
	w.requireBatchDiagnostics(batchesD, resourcesSkippedCode)
	w.requireBatchDiagnostics(batchesD2, "")
	require.Zero(t, w.count(&models.OtelHourlyActivity{}, "connection_id = ?", revoked.ID))
	beforeSuccessor := w.factsOf(successor.ID)
	requireFilled(t, beforeSuccessor)

	w.rebind(revoked, orgR, w.replayDates(-2, -1))
	w.drainAfterMidnight()

	afterRevoked := w.factsOf(revoked.ID)
	requireFilled(t, afterRevoked)
	require.Equal(t, beforeSuccessor, w.factsOf(successor.ID))
	for _, table := range []interface{}{&models.OtelHourlyActivity{}, &models.OtelHourlyModelUsage{}, &models.OtelHourlyToolUsage{}, &models.OtelHourlySessionStart{}} {
		require.Positive(t, w.count(table, "connection_id = ? AND hour_start >= ? AND hour_start < ?", revoked.ID, w.day(-2), w.day(-1)))
		require.Zero(t, w.count(table, "connection_id = ? AND hour_start >= ?", revoked.ID, revokedAt))
		require.Zero(t, w.count(table, "connection_id = ? AND hour_start < ?", successor.ID, revokedAt))
	}
	w.requireReplaysCompleted()
}

func TestRebindRequeuesLogBatchesForTheReboundTeam(t *testing.T) {
	w := newWorld(t)
	fixture := w.seedBase(w.day(-3))
	w.seedLogBatches(baseLayout, w.day(-2), w.day(-1), w.today)
	w.drainNow()

	require.Zero(t, w.count(&models.OtelEvent{}, "connection_id = ? AND organization_id = ?", fixture.a.ID, orgR))
	require.Positive(t, w.count(&models.OtelEvent{}, "connection_id = ? AND user_key = ?", fixture.a.ID, stray.logUserKey()))
	require.Zero(t, w.count(&ai.AiPrompt{}, "workspace_key = ?", orgR))
	beforeB, beforeC := w.logFactsOf(fixture.b.ID, orgB), w.logFactsOf(fixture.c.ID, orgC)
	for _, set := range []logFacts{beforeB, beforeC} {
		require.NotEmpty(t, set.Events)
		require.NotEmpty(t, set.Prompt)
		require.NotEmpty(t, set.Failure)
	}

	w.rebind(fixture.a, orgR, w.replayDates(-2, 0))
	w.drainNow()
	w.drainAfterMidnight()

	for _, who := range []actor{a1, a2, a3, a4, a5} {
		for offset := -2; offset <= 0; offset++ {
			w.requireLogsOn(fixture.a.ID, orgR, who, w.day(offset))
		}
	}
	want := expectLogs(baseLayout, 3, func(who actor) bool { return who.team == "alpha" && who.org == orgR })
	require.Equal(t, int64(want.events), w.count(&models.OtelEvent{}, "connection_id = ? AND organization_id = ?", fixture.a.ID, orgR))
	require.Equal(t, beforeB, w.logFactsOf(fixture.b.ID, orgB))
	require.Equal(t, beforeC, w.logFactsOf(fixture.c.ID, orgC))
	reboundR := w.logFactsOf(fixture.a.ID, orgR)
	require.NotEmpty(t, reboundR.Failure)
	failureKinds := make(map[string]int)
	for _, failure := range reboundR.Failure {
		failureKinds[failure.FailureKind]++
	}
	require.Equal(t, map[string]int{ai.FailureKindToolError: want.toolErrors, ai.FailureKindApiError: want.apiErrors}, failureKinds)

	requests := w.requireReplaysCompleted()
	require.Len(t, requests, 2)
	require.Equal(t, models.OtelReplayKindMetrics, requests[0].Kind)
	require.Equal(t, models.OtelReplayKindLogs, requests[1].Kind)
	audits := snapshot[models.OtelAuditEvent](w, "id", "action = ? AND connection_id = ?", models.OtelAuditActionReplayRequested, fixture.a.ID)
	require.Len(t, audits, 1)
	require.NotNil(t, audits[0].Detail)
	var detail struct{ Queued []uint64 }
	require.NoError(t, json.Unmarshal([]byte(*audits[0].Detail), &detail))
	require.Equal(t, []uint64{requests[0].ID, requests[1].ID}, detail.Queued)

	// Replaying the rebound team's completed days again rebuilds the same rows.
	_, err := service.CreateOtelReplay(e2eUser, &service.OtelReplayInput{OtelReplayRange: w.replayDates(-2, -1)})
	require.NoError(t, err)
	w.drainNow()
	replays := w.requireReplaysCompleted()
	require.Len(t, replays, len(requests)+2)
	require.Equal(t, models.OtelReplayKindLogs, replays[len(replays)-1].Kind)
	require.Positive(t, replays[len(replays)-1].ReplayedBatches)
	require.Equal(t, reboundR, w.logFactsOf(fixture.a.ID, orgR))
}

const (
	repoAlpha      = "https://github.com/org/alpha"
	repoBetaSSH    = "git@github.com:Org/Beta.git"
	repoBeta       = "https://github.com/org/beta"
	providerClaude = "claude"
)

// preRepositoryID is the canonical ID of a row without a repository: its grain has no repository element.
func preRepositoryID(kind ai.IDKind, workspace string, grain ...string) string {
	return ai.CanonicalKey{Kind: kind, Provider: providerClaude, WorkspaceKey: workspace, Grain: grain}.ID()
}

func repositoryRequest(at time.Time, sessions []repositorySession) *collectormetrics.ExportMetricsServiceRequest {
	request := &collectormetrics.ExportMetricsServiceRequest{}
	for index, session := range sessions {
		request.ResourceMetrics = append(request.ResourceMetrics, withRepository(a1.resource(at.Add(time.Duration(index)*time.Minute), session.seed), session.sent))
	}
	return request
}

// repositorySession is one session's export: the seed varies its values, sent is the repository it reports and stored is what is kept.
type repositorySession struct {
	seed         int
	sent, stored string
}

func TestRepositorySplitsHourlyAndCanonicalFacts(t *testing.T) {
	w := newWorld(t)
	connection := w.connection(a1.team, a1.org, w.day(-5))
	day := w.day(-1)
	hour := day.Add(9 * time.Hour)
	sessions := []repositorySession{{1, repoAlpha, repoAlpha}, {2, repoBetaSSH, repoBeta}, {4, "", ""}}
	w.insertMetricRequest(repositoryRequest(hour, sessions))
	w.drainNow()

	repositories := func(urls []string) []string { slices.Sort(urls); return urls }
	want := []string{"", repoAlpha, repoBeta}
	hourly := w.factsOf(connection.ID)
	var activityRepos, modelRepos, toolRepos []string
	for _, row := range hourly.Activity {
		require.True(t, hour.Equal(row.HourStart))
		require.Len(t, row.RepositoryKey, 16)
		activityRepos = append(activityRepos, row.RepositoryUrl)
	}
	for _, row := range hourly.Model {
		modelRepos = append(modelRepos, row.RepositoryUrl)
	}
	for _, row := range hourly.Tool {
		toolRepos = append(toolRepos, row.RepositoryUrl)
	}
	require.Equal(t, want, repositories(activityRepos))
	require.Equal(t, want, repositories(modelRepos))
	require.Equal(t, want, repositories(slices.Compact(repositories(toolRepos))))

	require.Len(t, hourly.SessionStart, len(sessions))
	for _, row := range hourly.SessionStart {
		matched := false
		for _, session := range sessions {
			if row.SessionId == "sess-alpha-alpha1-"+strconv.Itoa(session.seed) {
				require.Equal(t, session.stored, row.RepositoryUrl, row.SessionId)
				matched = true
			}
		}
		require.True(t, matched, row.SessionId)
	}

	var activityURLs, modelURLs, toolURLs []string
	for _, row := range hourly.AiActivity {
		activityURLs = append(activityURLs, *row.RepositoryUrl)
	}
	for _, row := range hourly.AiModel {
		modelURLs = append(modelURLs, *row.RepositoryUrl)
	}
	for _, row := range hourly.AiTool {
		toolURLs = append(toolURLs, *row.RepositoryUrl)
	}
	require.Equal(t, want, repositories(activityURLs))
	require.Equal(t, want, repositories(modelURLs))
	require.Equal(t, want, repositories(toolURLs))

	// A row without a repository keeps the ID it had before repositories were recorded.
	label := day.Format(dateLayout)
	for _, row := range hourly.AiActivity {
		if *row.RepositoryUrl == "" {
			require.Equal(t, int64(1), w.count(&ai.AiActivity{}, "id = ? AND repository_url = ?", preRepositoryID(ai.IDKindActivity, a1.org, a1.userKey(), label, "CODE_EDIT", "cli"), ""))
		}
	}
	for _, row := range hourly.AiModel {
		if *row.RepositoryUrl == "" {
			require.Equal(t, int64(1), w.count(&ai.AiModelUsage{}, "id = ? AND repository_url = ?", preRepositoryID(ai.IDKindModelUsage, a1.org, a1.userKey(), label, row.Model), ""))
		}
	}
	for _, row := range hourly.AiTool {
		if *row.RepositoryUrl == "" {
			require.Equal(t, int64(1), w.count(&ai.AiToolDecision{}, "id = ? AND repository_url = ?", preRepositoryID(ai.IDKindToolDecision, a1.org, a1.userKey(), label, row.ToolName), ""))
		}
	}

	live := w.factsOfWithIDs(connection.ID)
	_, err := service.CreateOtelReplay(e2eUser, &service.OtelReplayInput{OtelReplayRange: w.replayDates(-1, -1)})
	require.NoError(t, err)
	w.drainNow()
	require.Equal(t, hourly, w.factsOf(connection.ID))
	require.Equal(t, live, w.factsOfWithIDs(connection.ID))
	_, err = service.CreateOtelReplay(e2eUser, &service.OtelReplayInput{OtelReplayRange: w.replayDates(-1, -1)})
	require.NoError(t, err)
	w.drainNow()
	require.Equal(t, hourly, w.factsOf(connection.ID))
	require.Equal(t, live, w.factsOfWithIDs(connection.ID))
	w.requireReplaysCompleted()
}

// factsOfWithIDs lists the canonical row IDs the connection produced, which snapshots clear.
func (w *world) factsOfWithIDs(connectionID uint64) []string {
	var ids []string
	for _, table := range []string{"ai_activities", "ai_model_usages", "ai_tool_decisions"} {
		var tableIDs []string
		require.NoError(w.t, w.tester.Db.Raw("SELECT id FROM "+table+" WHERE source_connection_id = ? ORDER BY id", connectionID).Scan(&tableIDs).Error)
		ids = append(ids, tableIDs...)
	}
	return ids
}

func TestLiveRepositoryRowsJoinAnExistingUserDay(t *testing.T) {
	w := newWorld(t)
	connection := w.connection(a1.team, a1.org, w.day(-5))
	day := w.day(-1)
	hour := day.Add(9 * time.Hour)
	w.insertMetricRequest(repositoryRequest(hour, []repositorySession{{1, "", ""}}))
	w.drainNow()
	w.insertMetricRequest(repositoryRequest(hour.Add(time.Hour), []repositorySession{{2, repoAlpha, repoAlpha}}))
	w.drainNow()

	label := day.Format(dateLayout)
	rows := snapshot[ai.AiActivity](w, canonicalActivityOrder, "workspace_key = ? AND user_key = ? AND date = ?", a1.org, a1.userKey(), label)
	require.Len(t, rows, 2)
	require.Equal(t, "", *rows[0].RepositoryUrl)
	require.Equal(t, repoAlpha, *rows[1].RepositoryUrl)
	require.Equal(t, int64(1), w.count(&ai.AiActivity{}, "id = ? AND repository_url = ?", preRepositoryID(ai.IDKindActivity, a1.org, a1.userKey(), label, "CODE_EDIT", "cli"), ""))

	var sessions, added int
	for _, row := range snapshot[models.OtelHourlyActivity](w, hourlyActivityOrder, "connection_id = ?", connection.ID) {
		sessions += int(row.SessionCount)
		added += int(row.LinesAdded)
	}
	require.Equal(t, sessions, rows[0].NumSessions+rows[1].NumSessions)
	require.Equal(t, added, rows[0].LinesAdded+rows[1].LinesAdded)
	require.Positive(t, rows[0].NumSessions)
	require.Positive(t, rows[1].NumSessions)
}
