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
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

// rollupEventColumns are the event columns the rollup reads. prompt_text is left out, so
// prompt text can never reach ai_* tables and large texts are not loaded per rollup.
var rollupEventColumns = dal.Select("event_key, connection_id, user_key, user_account_id, user_email, session_id, prompt_id, " +
	"event_name, event_sequence, event_timestamp, command_name, model, query_source, tool_name, mcp_server_name, skill_name, plugin_name, success, duration_ms, cost_usd, " +
	"input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, attributes")

const (
	// planCommand enters plan mode without a permission_mode_changed event.
	planCommand = "plan"
	// permissionModeAttribute is the mode a tool_decision reports from client v2.1.301.
	permissionModeAttribute = "permission_mode"
	// observedModeCondition keeps the tool decisions that report a permission mode.
	observedModeCondition = "JSON_TYPE(JSON_EXTRACT(attributes, '$.permission_mode')) = 'STRING'"
	skillToolName         = "Skill"
	toolDecisionReject    = "reject"
	maxModelsUsedLength   = 1024
	// mainThreadQuerySource is the api_request query_source of the conversation itself,
	// as opposed to background work such as session titles and summaries.
	mainThreadQuerySource = "repl_main_thread"
	// Widths of ai_* columns filled straight from event attributes, which have no typed
	// event column to bound them. The rollup rereads stored events, so an oversized value
	// would otherwise fail every later batch that touches its prompt or session.
	maxCommandSourceLength = 32 // ai_prompts.command_source
	maxAiLabelLength       = 64 // skill invocation_trigger and skill_source, permission modes and trigger
	// maxRepositoryURLLength is the width of ai_prompts.repository_url. A longer URL is left
	// out rather than truncated, because a truncated URL would name a different repository.
	maxRepositoryURLLength = 255
	// maxErrorMessageLength is the width of ai_prompt_failures.error_message.
	maxErrorMessageLength = 1024
	// rollupInsertBatchSize keeps each rebuilt-rows INSERT far below MySQL's 65,535 placeholder limit.
	rollupInsertBatchSize = 500
	// Widths of ai_session_hooks columns filled from hook_registered attributes.
	maxHookSourceLength = 64
	maxHookEventLength  = 64
	maxHookNameLength   = 255
	maxHookTypeLength   = 64
)

// modelSnapshotDate and modelVariantSuffix match a model ID's -YYYYMMDD snapshot date and
// trailing variant such as [1m], which baseModelID drops.
var (
	modelSnapshotDate  = regexp.MustCompile(`-[0-9]{8}`)
	modelVariantSuffix = regexp.MustCompile(`\[[^\]]*\]$`)
)

// subagentToolNames launch a subagent; Task is the legacy name of Agent.
var subagentToolNames = map[string]struct{}{"Agent": {}, "Task": {}}

// sessionTarget is one session, or for clients that send no session.id one user's
// session-less events, whose prompts a batch touched.
type sessionTarget struct {
	connectionID uint64
	userKey      string
	sessionID    string
	promptIDs    map[string]struct{}
	modeChanged  bool
	// modeObserved is set when a tool_decision in the batch reported a mode, from earliestObserved on.
	modeObserved     bool
	earliestObserved time.Time
	// hooksRegistered is set when the batch holds a hook_registered event of the session.
	hooksRegistered bool
}

func sessionTargets(events []preparedEvent) []*sessionTarget {
	byKey := make(map[string]*sessionTarget)
	for _, prepared := range events {
		event := prepared.event
		key := fmt.Sprintf("%d\x00%s\x00%s", event.ConnectionId, event.UserKey, event.SessionId)
		target := byKey[key]
		if target == nil {
			target = &sessionTarget{connectionID: event.ConnectionId, userKey: event.UserKey, sessionID: event.SessionId, promptIDs: make(map[string]struct{})}
			byKey[key] = target
		}
		if event.PromptId != "" {
			target.promptIDs[event.PromptId] = struct{}{}
		}
		if event.SessionId != "" && event.EventName == eventHookRegistered {
			target.hooksRegistered = true
		}
		if event.SessionId != "" && isModeChangeEvent(event) {
			target.modeChanged = true
		}
		if event.SessionId != "" {
			if _, ok := observedModeOf(event); ok {
				if !target.modeObserved || event.EventTimestamp.Before(target.earliestObserved) {
					target.earliestObserved = event.EventTimestamp
				}
				target.modeObserved = true
			}
		}
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	targets := make([]*sessionTarget, 0, len(keys))
	for _, key := range keys {
		targets = append(targets, byKey[key])
	}
	return targets
}

// modeChange is one permission_mode_changed event in session order.
type modeChange struct {
	at       time.Time
	sequence int64
	fromMode string
	toMode   string
	trigger  string
}

// sessionModes answers which permission mode was active at a point in a session.
type sessionModes struct {
	changes []modeChange
}

// modeChangeSource reads a permission mode change from one kind of event that switches
// the session's mode.
type modeChangeSource struct {
	matches func(event *models.OtelEvent) bool
	read    func(attributes map[string]interface{}) (fromMode, toMode, trigger string)
}

// modeChangeSources are the events that switch a session's permission mode. Claude Code
// reports Shift+Tab and plan-mode exits as permission_mode_changed, but entering plan mode
// with /plan only as the user_prompt of that command.
var modeChangeSources = []modeChangeSource{
	{
		matches: func(event *models.OtelEvent) bool { return event.EventName == eventPermissionModeChanged },
		read: func(attributes map[string]interface{}) (string, string, string) {
			return truncate(eventString(attributes, "from_mode"), maxAiLabelLength),
				truncate(eventString(attributes, "to_mode"), maxAiLabelLength),
				truncate(eventString(attributes, "trigger"), maxAiLabelLength)
		},
	},
	{
		matches: func(event *models.OtelEvent) bool {
			return event.EventName == eventUserPrompt && event.CommandName == planCommand
		},
		// The mode before /plan is unknown; prompts before it fall back to the default.
		read: func(map[string]interface{}) (string, string, string) {
			return "", ai.PermissionModePlan, "plan_command"
		},
	},
}

// modeChangeSourceOf returns the source that reads event as a mode change, or nil when
// event does not switch the mode.
func modeChangeSourceOf(event *models.OtelEvent) *modeChangeSource {
	for i := range modeChangeSources {
		if modeChangeSources[i].matches(event) {
			return &modeChangeSources[i]
		}
	}
	return nil
}

func isModeChangeEvent(event *models.OtelEvent) bool {
	return modeChangeSourceOf(event) != nil
}

func newSessionModes(events []*models.OtelEvent) sessionModes {
	changes := make([]modeChange, 0)
	for _, event := range events {
		source := modeChangeSourceOf(event)
		if source == nil {
			continue
		}
		change := modeChange{at: event.EventTimestamp, sequence: int64Value(event.EventSequence)}
		change.fromMode, change.toMode, change.trigger = source.read(eventAttributes(event))
		changes = append(changes, change)
	}
	sort.SliceStable(changes, func(i, j int) bool {
		return lessEventOrder(changes[i].at, changes[i].sequence, changes[j].at, changes[j].sequence)
	})
	return sessionModes{changes: changes}
}

// modeAt returns the mode active at (at, sequence) and whether it was inferred. Claude Code
// reports only mode changes, so a prompt before the first change ran in that change's
// from_mode, and a session with no change, or whose first change is /plan, is assumed to
// start in the default mode.
func (m sessionModes) modeAt(at time.Time, sequence int64) (string, bool) {
	if len(m.changes) == 0 {
		return ai.PermissionModeDefault, true
	}
	mode := ""
	for _, change := range m.changes {
		if lessEventOrder(at, sequence, change.at, change.sequence) {
			break
		}
		mode = change.toMode
	}
	if mode == "" {
		mode = m.changes[0].fromMode
	}
	if mode == "" {
		return ai.PermissionModeDefault, true
	}
	return mode, false
}

// lessEventOrder orders events by time, then by the per-process sequence for events that
// share a timestamp.
func lessEventOrder(leftAt time.Time, leftSequence int64, rightAt time.Time, rightSequence int64) bool {
	if !leftAt.Equal(rightAt) {
		return leftAt.Before(rightAt)
	}
	return leftSequence < rightSequence
}

// observedMode is the permission mode one tool decision reported.
type observedMode struct {
	at       time.Time
	sequence int64
	promptID string
	mode     string
}

// observedModeOf reads the mode a tool_decision reported; clients before v2.1.301 report none.
func observedModeOf(event *models.OtelEvent) (observedMode, bool) {
	if event.EventName != eventToolDecision {
		return observedMode{}, false
	}
	mode := truncate(eventString(eventAttributes(event), permissionModeAttribute), maxAiLabelLength)
	if mode == "" {
		return observedMode{}, false
	}
	return observedMode{at: event.EventTimestamp, sequence: int64Value(event.EventSequence), promptID: event.PromptId, mode: mode}, true
}

// firstObservedMode returns the earliest mode the events' tool decisions reported, or nil.
func firstObservedMode(events []*models.OtelEvent) *observedMode {
	var first *observedMode
	for _, event := range events {
		observed, ok := observedModeOf(event)
		if !ok {
			continue
		}
		if first == nil || lessEventOrder(observed.at, observed.sequence, first.at, first.sequence) {
			found := observed
			first = &found
		}
	}
	return first
}

// latestChangeAt returns the last mode change at or before (at, sequence), with the same ordering modeAt uses.
func (m sessionModes) latestChangeAt(at time.Time, sequence int64) (modeChange, bool) {
	var latest modeChange
	found := false
	for _, change := range m.changes {
		if lessEventOrder(at, sequence, change.at, change.sequence) {
			break
		}
		latest, found = change, true
	}
	return latest, found
}

// promptMode resolves a prompt's mode: its own observed decision, else the latest one earlier in the session unless a later mode change overrides it, else the inferred mode.
func (m sessionModes) promptMode(own, earlier *observedMode, at time.Time, sequence int64) (string, bool) {
	if own != nil {
		return own.mode, false
	}
	if earlier != nil {
		change, found := m.latestChangeAt(at, sequence)
		if !found || lessEventOrder(change.at, change.sequence, earlier.at, earlier.sequence) {
			return earlier.mode, false
		}
	}
	return m.modeAt(at, sequence)
}

// promptRollup is one prompt's facts derived from its events.
type promptRollup struct {
	prompt   *ai.AiPrompt
	skills   []*ai.AiPromptSkill
	failures []*ai.AiPromptFailure
	tools    []*ai.AiPromptTool
	// firstMainRequestAt is the time of the prompt's first main-thread request, nil when it made none.
	firstMainRequestAt *time.Time
}

// buildPromptRollup derives one prompt row, its skills and its failures from the prompt's
// events. The caller sets the permission mode and the DevLake account.
func buildPromptRollup(workspaceKey, promptID string, events []*models.OtelEvent) promptRollup {
	sort.SliceStable(events, func(i, j int) bool {
		return lessEventOrder(events[i].EventTimestamp, int64Value(events[i].EventSequence), events[j].EventTimestamp, int64Value(events[j].EventSequence))
	})
	builder := &promptBuilder{
		prompt: &ai.AiPrompt{
			DomainEntity:     domainlayer.NewDomainEntity(ai.CanonicalKey{Kind: ai.IDKindPrompt, Provider: aiProviderClaude, WorkspaceKey: workspaceKey, Grain: []string{promptID}}.ID()),
			Provider:         aiProviderClaude,
			WorkspaceKey:     workspaceKey,
			PromptId:         promptID,
			EstimatedCostUsd: "0.00000000",
			SourceType:       aiSourceOtel,
		},
		skills: newSkillCollector(workspaceKey, promptID),
		models: make(map[string]struct{}),
		tools:  make(map[toolKey]*ai.AiPromptTool),
	}
	prompt := builder.prompt
	for index, event := range events {
		if index == 0 {
			prompt.StartedAt = event.EventTimestamp
			fillPromptIdentity(prompt, event)
		}
		prompt.EndedAt = latestTime(prompt.EndedAt, event.EventTimestamp)
		attributes := eventAttributes(event)
		if prompt.RepositoryUrl == nil {
			prompt.RepositoryUrl = repositoryURL(attributes)
		}
		if apply, handled := promptEventAppliers[event.EventName]; handled {
			apply(builder, event, attributes)
		}
	}
	// Sorted, so prompts that used the same models group together whatever order they used them in.
	prompt.ModelsUsed = truncate(strings.Join(sortedKeys(builder.models), ","), maxModelsUsedLength)
	collected := builder.skills.result(prompt)
	prompt.SkillCount = int64(len(collected))
	prompt.UsedSkill = len(collected) > 0
	for _, failure := range builder.failures {
		failure.AiPromptId = prompt.Id
		failure.UserKey = prompt.UserKey
		failure.UserEmail = prompt.UserEmail
		failure.SessionId = prompt.SessionId
	}
	tools := builder.sortedTools()
	for _, tool := range tools {
		tool.AiPromptId = prompt.Id
		tool.UserKey = prompt.UserKey
		tool.UserEmail = prompt.UserEmail
		tool.SessionId = prompt.SessionId
		tool.StartedAt = prompt.StartedAt
	}
	return promptRollup{prompt: prompt, skills: collected, failures: builder.failures, tools: tools, firstMainRequestAt: builder.firstMainRequestAt}
}

// promptBuilder accumulates one prompt's row, skills, failures and models from its ordered events.
type promptBuilder struct {
	prompt   *ai.AiPrompt
	skills   *skillCollector
	models   map[string]struct{}
	failures []*ai.AiPromptFailure
	tools    map[toolKey]*ai.AiPromptTool
	// firstMainRequestAt is the time of the first main-thread request, which also supplies the first-request fields.
	firstMainRequestAt *time.Time
	// mainThreadEffort is set once a main-thread request has given the prompt its effort,
	// so a later request cannot replace it.
	mainThreadEffort bool
}

// toolKey names one tool row of a prompt.
type toolKey struct {
	toolName      string
	mcpServerName string
}

// promptEventApplier adds one event's contribution to the prompt being built.
type promptEventApplier func(b *promptBuilder, event *models.OtelEvent, attributes map[string]interface{})

// promptEventAppliers maps each event name that contributes to a prompt to its applier.
// Other events only extend the prompt's time range.
var promptEventAppliers = map[string]promptEventApplier{
	eventUserPrompt:     (*promptBuilder).applyUserPrompt,
	eventAPIRequest:     (*promptBuilder).applyAPIRequest,
	eventAPIError:       (*promptBuilder).applyAPIError,
	eventToolResult:     (*promptBuilder).applyToolResult,
	eventToolDecision:   (*promptBuilder).applyToolDecision,
	eventSkillActivated: (*promptBuilder).applySkillActivated,

	eventHookExecutionComplete: (*promptBuilder).applyHookExecution,
}

func (b *promptBuilder) applyUserPrompt(event *models.OtelEvent, attributes map[string]interface{}) {
	// The user_prompt event marks the start, even when an earlier-stamped event of the same
	// prompt arrived.
	b.prompt.StartedAt = event.EventTimestamp
	fillPromptIdentity(b.prompt, event)
	b.prompt.PromptLength = int64Value(eventNumber(attributes, "prompt_length"))
	b.prompt.CommandName = event.CommandName
	b.prompt.CommandSource = truncate(eventString(attributes, "command_source"), maxCommandSourceLength)
}

func (b *promptBuilder) applyAPIRequest(event *models.OtelEvent, attributes map[string]interface{}) {
	b.prompt.ApiRequestCount++
	b.applyEffort(event.QuerySource, truncate(eventString(attributes, "effort"), maxAiLabelLength))
	b.prompt.InputTokens += event.InputTokens
	b.prompt.OutputTokens += event.OutputTokens
	b.prompt.CacheReadTokens += event.CacheReadTokens
	b.prompt.CacheCreationTokens += event.CacheCreationTokens
	if event.CostUsd != nil {
		if total, err := addDecimal(b.prompt.EstimatedCostUsd, *event.CostUsd, 8); err == nil {
			b.prompt.EstimatedCostUsd = total
		}
	}
	if model := baseModelID(event.Model); model != "" {
		b.models[model] = struct{}{}
	}
	b.skills.add(event.SkillName, ai.SkillDetectedViaApiRequest, "", "", event.PluginName, event.EventTimestamp)
	if event.QuerySource == mainThreadQuerySource && b.firstMainRequestAt == nil {
		at := event.EventTimestamp
		b.firstMainRequestAt = &at
		b.prompt.FirstRequestContextTokens = event.InputTokens + event.CacheReadTokens + event.CacheCreationTokens
		if event.CostUsd != nil {
			cost := *event.CostUsd
			if normalized, err := addDecimal("0", cost, 8); err == nil {
				cost = normalized
			}
			b.prompt.FirstRequestCostUsd = &cost
		}
	}
}

func (b *promptBuilder) applyHookExecution(_ *models.OtelEvent, attributes map[string]interface{}) {
	b.prompt.HookCount += int64Value(eventNumber(attributes, "num_hooks"))
	b.prompt.HookBlockCount += int64Value(eventNumber(attributes, "num_blocking"))
	b.prompt.HookErrorCount += int64Value(eventNumber(attributes, "num_non_blocking_error"))
	b.prompt.HookDurationMs += int64Value(eventNumber(attributes, "total_duration_ms"))
}

// toolRow returns the prompt's row for a tool and MCP server, creating it on first use.
func (b *promptBuilder) toolRow(toolName, mcpServerName string) *ai.AiPromptTool {
	key := toolKey{toolName: toolName, mcpServerName: mcpServerName}
	row := b.tools[key]
	if row == nil {
		row = &ai.AiPromptTool{
			DomainEntity: domainlayer.NewDomainEntity(ai.CanonicalKey{
				Kind: ai.IDKindPromptTool, Provider: aiProviderClaude, WorkspaceKey: b.prompt.WorkspaceKey,
				Grain: []string{b.prompt.PromptId, toolName, mcpServerName},
			}.ID()),
			Provider:      aiProviderClaude,
			WorkspaceKey:  b.prompt.WorkspaceKey,
			PromptId:      b.prompt.PromptId,
			ToolName:      toolName,
			McpServerName: mcpServerName,
		}
		b.tools[key] = row
	}
	return row
}

// sortedTools returns the tool rows ordered by tool name, then MCP server.
func (b *promptBuilder) sortedTools() []*ai.AiPromptTool {
	rows := make([]*ai.AiPromptTool, 0, len(b.tools))
	for _, row := range b.tools {
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].ToolName != rows[j].ToolName {
			return rows[i].ToolName < rows[j].ToolName
		}
		return rows[i].McpServerName < rows[j].McpServerName
	})
	return rows
}

// applyEffort records one api_request's effort on the prompt. The first main-thread
// request that reports an effort decides it. Until one does, the first request of any
// source does, so a prompt whose only requests were background work still gets a value.
// An empty effort changes nothing.
func (b *promptBuilder) applyEffort(querySource, effort string) {
	if effort == "" || b.mainThreadEffort {
		return
	}
	if querySource == mainThreadQuerySource {
		b.prompt.Effort = &effort
		b.mainThreadEffort = true
		return
	}
	if b.prompt.Effort == nil {
		b.prompt.Effort = &effort
	}
}

func (b *promptBuilder) applyAPIError(event *models.OtelEvent, attributes map[string]interface{}) {
	b.prompt.ApiErrorCount++
	failure := b.newFailure(event, ai.FailureKindApiError, attributes)
	failure.Model = event.Model
	failure.QuerySource = event.QuerySource
	failure.ErrorMessage = truncate(eventString(attributes, "error"), maxErrorMessageLength)
	failure.StatusCode = eventNumber(attributes, "status_code")
	failure.Attempt = eventNumber(attributes, "attempt")
}

func (b *promptBuilder) applyToolResult(event *models.OtelEvent, attributes map[string]interface{}) {
	b.prompt.ToolCallCount++
	row := b.toolRow(event.ToolName, event.McpServerName)
	row.CallCount++
	row.DurationMs += int64Value(event.DurationMs)
	if event.Success != nil && !*event.Success {
		b.prompt.ToolFailureCount++
		row.FailureCount++
		b.newFailure(event, ai.FailureKindToolError, attributes).ToolName = event.ToolName
	}
	if _, subagent := subagentToolNames[event.ToolName]; subagent {
		b.prompt.SubagentCount++
	}
	if event.ToolName == skillToolName {
		b.skills.add(event.SkillName, ai.SkillDetectedViaSkillTool, "", "", "", event.EventTimestamp)
	}
}

// newFailure adds a failure row for event to the prompt and returns it. buildPromptRollup
// fills in the prompt's identity once all events are applied.
func (b *promptBuilder) newFailure(event *models.OtelEvent, kind string, attributes map[string]interface{}) *ai.AiPromptFailure {
	failure := &ai.AiPromptFailure{
		DomainEntity: domainlayer.NewDomainEntity(ai.CanonicalKey{
			Kind: ai.IDKindPromptFailure, Provider: aiProviderClaude, WorkspaceKey: b.prompt.WorkspaceKey,
			Grain: []string{b.prompt.PromptId, hex.EncodeToString(event.EventKey)},
		}.ID()),
		Provider:     aiProviderClaude,
		WorkspaceKey: b.prompt.WorkspaceKey,
		PromptId:     b.prompt.PromptId,
		FailureKind:  kind,
		OccurredAt:   event.EventTimestamp,
		ErrorType:    truncate(eventString(attributes, "error_type"), eventNamedColumnLength),
		DurationMs:   event.DurationMs,
	}
	b.failures = append(b.failures, failure)
	return failure
}

func (b *promptBuilder) applyToolDecision(event *models.OtelEvent, attributes map[string]interface{}) {
	row := b.toolRow(event.ToolName, event.McpServerName)
	reject := eventString(attributes, "decision") == toolDecisionReject
	if reject {
		b.prompt.ToolRejectCount++
	}
	user := strings.HasPrefix(eventString(attributes, "source"), "user")
	switch {
	case user && reject:
		row.UserRejectCount++
	case user:
		row.UserAcceptCount++
	case reject:
		row.ConfigRejectCount++
	default:
		row.ConfigAcceptCount++
	}
}

func (b *promptBuilder) applySkillActivated(event *models.OtelEvent, attributes map[string]interface{}) {
	b.skills.add(event.SkillName, ai.SkillDetectedViaActivation, truncate(eventString(attributes, "invocation_trigger"), maxAiLabelLength),
		truncate(eventString(attributes, "skill.source"), maxAiLabelLength), event.PluginName, event.EventTimestamp)
}

// repositoryURL returns an event's normalized repository URL, or nil when it has none, it
// is not a remote repository URL, or it does not fit ai_prompts.repository_url. Ingest
// already normalized it; normalizing again keeps the column clean for events stored from
// earlier raw batches. Claude Code derives it once per session, so every event of a prompt
// carries the same value.
func repositoryURL(attributes map[string]interface{}) *string {
	url, ok := normalizeRepositoryURL(eventString(attributes, repositoryURLAttribute))
	if !ok || utf8.RuneCountInString(url) > maxRepositoryURLLength {
		return nil
	}
	return &url
}

func fillPromptIdentity(prompt *ai.AiPrompt, event *models.OtelEvent) {
	prompt.UserKey = event.UserKey
	prompt.UserAccountId = event.UserAccountId
	prompt.UserEmail = stringValue(event.UserEmail)
	prompt.SourceConnectionId = event.ConnectionId
	prompt.SessionId = event.SessionId
}

// skillCollector merges the ways one skill use is reported into one row per skill.
// skill_activated is the most specific source, then the Skill tool, then api_request.
type skillCollector struct {
	workspaceKey string
	promptID     string
	order        []string
	skills       map[string]*ai.AiPromptSkill
}

var skillSourceRank = map[string]int{
	ai.SkillDetectedViaActivation: 3,
	ai.SkillDetectedViaSkillTool:  2,
	ai.SkillDetectedViaApiRequest: 1,
}

func newSkillCollector(workspaceKey, promptID string) *skillCollector {
	return &skillCollector{workspaceKey: workspaceKey, promptID: promptID, skills: make(map[string]*ai.AiPromptSkill)}
}

func (c *skillCollector) add(name, detectedVia, trigger, source, plugin string, at time.Time) {
	name = strings.TrimSpace(name)
	if name == "" {
		return
	}
	skill := c.skills[name]
	if skill == nil {
		skill = &ai.AiPromptSkill{
			DomainEntity: domainlayer.NewDomainEntity(ai.CanonicalKey{Kind: ai.IDKindPromptSkill, Provider: aiProviderClaude, WorkspaceKey: c.workspaceKey, Grain: []string{c.promptID, name}}.ID()),
			Provider:     aiProviderClaude,
			WorkspaceKey: c.workspaceKey,
			PromptId:     c.promptID,
			SkillName:    name,
			DetectedVia:  detectedVia,
			FirstUsedAt:  at,
		}
		c.skills[name] = skill
		c.order = append(c.order, name)
	}
	mergeSkillFacts(skill, detectedVia, trigger, source, plugin, at)
}

// mergeSkillFacts folds one observation of a skill into its row.
func mergeSkillFacts(into *ai.AiPromptSkill, detectedVia, trigger, source, plugin string, at time.Time) {
	if skillSourceRank[detectedVia] > skillSourceRank[into.DetectedVia] {
		into.DetectedVia = detectedVia
	}
	if at.Before(into.FirstUsedAt) {
		into.FirstUsedAt = at
	}
	into.InvocationTrigger = firstNonEmpty(into.InvocationTrigger, trigger)
	into.SkillSource = firstNonEmpty(into.SkillSource, source)
	into.PluginName = firstNonEmpty(into.PluginName, plugin)
}

// mergeNamespaced folds a plain skill name into its one plugin-namespaced twin and fills a missing plugin name from the prefix.
func (c *skillCollector) mergeNamespaced() {
	merged := make(map[string]bool)
	for _, name := range c.order {
		if strings.Contains(name, ":") {
			continue
		}
		var match string
		matches := 0
		for _, other := range c.order {
			if strings.HasSuffix(other, ":"+name) {
				match = other
				matches++
			}
		}
		if matches != 1 {
			continue
		}
		plain, target := c.skills[name], c.skills[match]
		mergeSkillFacts(target, plain.DetectedVia, plain.InvocationTrigger, plain.SkillSource, plain.PluginName, plain.FirstUsedAt)
		merged[name] = true
	}
	kept := c.order[:0]
	for _, name := range c.order {
		if merged[name] {
			delete(c.skills, name)
			continue
		}
		kept = append(kept, name)
		if prefix, _, ok := strings.Cut(name, ":"); ok && prefix != "" {
			c.skills[name].PluginName = firstNonEmpty(c.skills[name].PluginName, prefix)
		}
	}
	c.order = kept
}

func (c *skillCollector) result(prompt *ai.AiPrompt) []*ai.AiPromptSkill {
	c.mergeNamespaced()
	skills := make([]*ai.AiPromptSkill, 0, len(c.order))
	for _, name := range c.order {
		skill := c.skills[name]
		skill.UserKey = prompt.UserKey
		skill.SessionId = prompt.SessionId
		skills = append(skills, skill)
	}
	return skills
}

// rollupSessions rebuilds the prompts a batch touched, and when the batch changed a
// session's mode history, the mode of every prompt in that session. Every storage error is
// classified here, once, so the rollup's helpers return plain wrapped errors.
func rollupSessions(tx dal.Transaction, workspaceKeys map[uint64]string, targets []*sessionTarget) error {
	for _, target := range targets {
		workspaceKey := workspaceKeys[target.connectionID]
		if workspaceKey == "" {
			continue
		}
		if err := rollupSession(tx, workspaceKey, target); err != nil {
			return classifyStorageError(err)
		}
	}
	return nil
}

func rollupSession(tx dal.Transaction, workspaceKey string, target *sessionTarget) error {
	refresh := target.sessionID != "" && (target.modeChanged || target.modeObserved)
	var observed []observedMode
	observedLoaded := false
	modes := sessionModes{}
	promptSequences := make(map[string]int64)
	if target.sessionID != "" {
		// Only the session's mode changes are loaded, so the work per batch does not grow
		// with the number of prompts in the session.
		changeEvents := make([]*models.OtelEvent, 0)
		if err := tx.All(&changeEvents, rollupEventColumns, dal.Where(
			"connection_id = ? AND user_key = ? AND session_id = ? AND (event_name = ? OR (event_name = ? AND command_name = ?))",
			target.connectionID, target.userKey, target.sessionID, eventPermissionModeChanged, eventUserPrompt, planCommand)); err != nil {
			return fmt.Errorf("load Claude Code session mode events: %w", err)
		}
		modes = newSessionModes(changeEvents)
		if target.modeChanged {
			if err := writeModeChanges(tx, workspaceKey, target, changeEvents, modes); err != nil {
				return err
			}
		}
		if refresh {
			sequences, err := loadPromptSequences(tx, target)
			if err != nil {
				return err
			}
			promptSequences = sequences
		}
	}
	accounts := make(map[string]string)
	for _, promptID := range sortedKeys(target.promptIDs) {
		events := make([]*models.OtelEvent, 0)
		if err := tx.All(&events, rollupEventColumns, dal.Where("connection_id = ? AND user_key = ? AND prompt_id = ?", target.connectionID, target.userKey, promptID)); err != nil {
			return fmt.Errorf("load Claude Code prompt events: %w", err)
		}
		if len(events) == 0 {
			continue
		}
		rollup := buildPromptRollup(workspaceKey, promptID, events)
		if rollup.firstMainRequestAt != nil && target.sessionID != "" {
			idle, idleErr := idleBeforeSeconds(tx, target, *rollup.firstMainRequestAt)
			if idleErr != nil {
				return idleErr
			}
			rollup.prompt.IdleBeforeSeconds = idle
		}
		own := firstObservedMode(events)
		sequence := promptSequence(events)
		var earlier *observedMode
		if own == nil && target.sessionID != "" {
			if !observedLoaded {
				loaded, loadErr := sessionObservedModes(tx, target)
				if loadErr != nil {
					return loadErr
				}
				observed, observedLoaded = loaded, true
			}
			earlier = earlierObservedMode(observed, promptID, rollup.prompt.StartedAt, sequence)
		}
		rollup.prompt.PermissionMode, rollup.prompt.PermissionModeInferred = modes.promptMode(own, earlier, rollup.prompt.StartedAt, sequence)
		accountID, err := domainAccountID(tx, accounts, workspaceKey, rollup.prompt.UserKey, rollup.prompt.UserAccountId, rollup.prompt.UserEmail)
		if err != nil {
			return err
		}
		rollup.prompt.AccountId = accountID
		if err := writePromptRollup(tx, rollup); err != nil {
			return err
		}
	}
	if target.hooksRegistered && target.sessionID != "" {
		if err := writeSessionHooks(tx, workspaceKey, target); err != nil {
			return err
		}
	}
	if refresh {
		return refreshSessionModes(tx, workspaceKey, target, modes, promptSequences, observed, observedLoaded)
	}
	return nil
}

// idleBeforeSeconds returns the whole seconds from the session's latest main-thread request before first to first, or nil when there is none.
func idleBeforeSeconds(tx dal.Transaction, target *sessionTarget, first time.Time) (*int64, error) {
	previous := make([]*models.OtelEvent, 0, 1)
	if err := tx.All(&previous, dal.Select("event_timestamp"), dal.Where(
		"connection_id = ? AND user_key = ? AND session_id = ? AND event_name = ? AND query_source = ? AND event_timestamp < ?",
		target.connectionID, target.userKey, target.sessionID, eventAPIRequest, mainThreadQuerySource, first),
		dal.Orderby("event_timestamp DESC"), dal.Limit(1)); err != nil {
		return nil, fmt.Errorf("load Claude Code previous main-thread request: %w", err)
	}
	if len(previous) == 0 {
		return nil, nil
	}
	seconds := int64(first.Sub(previous[0].EventTimestamp) / time.Second)
	return &seconds, nil
}

// writeSessionHooks rebuilds the session's hook rows from its hook_registered events.
func writeSessionHooks(tx dal.Transaction, workspaceKey string, target *sessionTarget) error {
	events := make([]*models.OtelEvent, 0)
	// The whole session is rebuilt whatever user key each event carries, matching the row id's scope.
	if err := tx.All(&events, rollupEventColumns, dal.Where("connection_id = ? AND session_id = ? AND event_name = ?",
		target.connectionID, target.sessionID, eventHookRegistered)); err != nil {
		return fmt.Errorf("load Claude Code session hooks: %w", err)
	}
	if err := tx.Delete(&ai.AiSessionHook{}, dal.Where("workspace_key = ? AND session_id = ?", workspaceKey, target.sessionID)); err != nil {
		return fmt.Errorf("clear Claude Code session hooks: %w", err)
	}
	return createInBatches(tx, buildSessionHooks(workspaceKey, target, events), "write Claude Code session hooks")
}

// buildSessionHooks groups hook_registered events into one row per hook source, event and name, keeping the earliest registration.
func buildSessionHooks(workspaceKey string, target *sessionTarget, events []*models.OtelEvent) []*ai.AiSessionHook {
	sort.SliceStable(events, func(i, j int) bool {
		return lessEventOrder(events[i].EventTimestamp, int64Value(events[i].EventSequence), events[j].EventTimestamp, int64Value(events[j].EventSequence))
	})
	byKey := make(map[[3]string]*ai.AiSessionHook)
	hooks := make([]*ai.AiSessionHook, 0)
	for _, event := range events {
		attributes := eventAttributes(event)
		source := truncate(eventString(attributes, "hook_source"), maxHookSourceLength)
		hookEvent := truncate(eventString(attributes, "hook_event"), maxHookEventLength)
		name := truncate(eventString(attributes, "hook_name"), maxHookNameLength)
		key := [3]string{source, hookEvent, name}
		if existing := byKey[key]; existing != nil {
			if event.EventTimestamp.Before(existing.FirstRegisteredAt) {
				existing.FirstRegisteredAt = event.EventTimestamp
			}
			continue
		}
		hook := &ai.AiSessionHook{
			DomainEntity: domainlayer.NewDomainEntity(ai.CanonicalKey{
				Kind: ai.IDKindSessionHook, Provider: aiProviderClaude, WorkspaceKey: workspaceKey,
				Grain: []string{target.sessionID, source, hookEvent, name},
			}.ID()),
			Provider:           aiProviderClaude,
			WorkspaceKey:       workspaceKey,
			SourceConnectionId: target.connectionID,
			UserKey:            target.userKey,
			UserEmail:          stringValue(event.UserEmail),
			SessionId:          target.sessionID,
			RepositoryUrl:      repositoryURL(attributes),
			HookSource:         source,
			HookEvent:          hookEvent,
			HookName:           name,
			HookType:           truncate(eventString(attributes, "hook_type"), maxHookTypeLength),
			FirstRegisteredAt:  event.EventTimestamp,
		}
		byKey[key] = hook
		hooks = append(hooks, hook)
	}
	return hooks
}

// earlierObservedMode returns the first decision of the latest earlier prompt that reported a mode, or nil.
func earlierObservedMode(observed []observedMode, promptID string, at time.Time, sequence int64) *observedMode {
	last := -1
	for i := range observed {
		if observed[i].promptID != promptID && lessEventOrder(observed[i].at, observed[i].sequence, at, sequence) {
			last = i
		}
	}
	if last < 0 {
		return nil
	}
	if observed[last].promptID == "" {
		return &observed[last]
	}
	for i := range observed {
		if observed[i].promptID == observed[last].promptID {
			return &observed[i]
		}
	}
	return nil
}

// sessionObservedModes loads the modes the session's tool decisions reported, in event order.
func sessionObservedModes(tx dal.Transaction, target *sessionTarget) ([]observedMode, error) {
	events := make([]*models.OtelEvent, 0)
	if err := tx.All(&events, rollupEventColumns, dal.Where("connection_id = ? AND user_key = ? AND session_id = ? AND event_name = ? AND "+observedModeCondition,
		target.connectionID, target.userKey, target.sessionID, eventToolDecision)); err != nil {
		return nil, fmt.Errorf("load Claude Code session permission modes: %w", err)
	}
	observed := make([]observedMode, 0, len(events))
	for _, event := range events {
		if mode, ok := observedModeOf(event); ok {
			observed = append(observed, mode)
		}
	}
	sort.SliceStable(observed, func(i, j int) bool {
		return lessEventOrder(observed[i].at, observed[i].sequence, observed[j].at, observed[j].sequence)
	})
	return observed, nil
}

// loadPromptSequences returns the event.sequence of each user_prompt in the session, which
// refreshSessionModes needs to order prompts it did not rebuild against mode changes.
func loadPromptSequences(tx dal.Transaction, target *sessionTarget) (map[string]int64, error) {
	promptEvents := make([]*models.OtelEvent, 0)
	if err := tx.All(&promptEvents, dal.Select("prompt_id, event_sequence"), dal.Where("connection_id = ? AND user_key = ? AND session_id = ? AND event_name = ?",
		target.connectionID, target.userKey, target.sessionID, eventUserPrompt)); err != nil {
		return nil, fmt.Errorf("load Claude Code session prompt sequences: %w", err)
	}
	sequences := make(map[string]int64, len(promptEvents))
	for _, event := range promptEvents {
		sequences[event.PromptId] = int64Value(event.EventSequence)
	}
	return sequences, nil
}

// promptSequence is the event.sequence of the prompt's user_prompt event, which orders it
// against mode changes that share its timestamp.
func promptSequence(events []*models.OtelEvent) int64 {
	for _, event := range events {
		if event.EventName == eventUserPrompt {
			return int64Value(event.EventSequence)
		}
	}
	return 0
}

func writePromptRollup(tx dal.Transaction, rollup promptRollup) error {
	if err := tx.CreateOrUpdate(rollup.prompt); err != nil {
		return fmt.Errorf("write Claude Code prompt: %w", err)
	}
	if err := tx.Delete(&ai.AiPromptSkill{}, dal.Where("workspace_key = ? AND prompt_id = ?", rollup.prompt.WorkspaceKey, rollup.prompt.PromptId)); err != nil {
		return fmt.Errorf("clear Claude Code prompt skills: %w", err)
	}
	for _, skill := range rollup.skills {
		if err := tx.CreateOrUpdate(skill); err != nil {
			return fmt.Errorf("write Claude Code prompt skill: %w", err)
		}
	}
	if err := tx.Delete(&ai.AiPromptFailure{}, dal.Where("workspace_key = ? AND prompt_id = ?", rollup.prompt.WorkspaceKey, rollup.prompt.PromptId)); err != nil {
		return fmt.Errorf("clear Claude Code prompt failures: %w", err)
	}
	// The prompt's rows were just deleted and failure ids are scoped to the prompt, so the
	// rebuilt rows are inserted in batches rather than upserted one at a time.
	if err := createInBatches(tx, rollup.failures, "write Claude Code prompt failures"); err != nil {
		return err
	}
	if err := tx.Delete(&ai.AiPromptTool{}, dal.Where("workspace_key = ? AND prompt_id = ?", rollup.prompt.WorkspaceKey, rollup.prompt.PromptId)); err != nil {
		return fmt.Errorf("clear Claude Code prompt tools: %w", err)
	}
	return createInBatches(tx, rollup.tools, "write Claude Code prompt tools")
}

func writeModeChanges(tx dal.Transaction, workspaceKey string, target *sessionTarget, events []*models.OtelEvent, modes sessionModes) error {
	email := ""
	for _, event := range events {
		email = firstNonEmpty(email, stringValue(event.UserEmail))
	}
	for _, change := range modes.changes {
		row := &ai.AiPermissionModeChange{
			DomainEntity: domainlayer.NewDomainEntity(ai.CanonicalKey{
				Kind: ai.IDKindPermissionModeChange, Provider: aiProviderClaude, WorkspaceKey: workspaceKey,
				Grain: []string{target.sessionID, ai.TimeGrain(change.at), change.fromMode, change.toMode},
			}.ID()),
			Provider:     aiProviderClaude,
			WorkspaceKey: workspaceKey,
			UserKey:      target.userKey,
			UserEmail:    email,
			SessionId:    target.sessionID,
			ChangedAt:    change.at,
			FromMode:     change.fromMode,
			ToMode:       change.toMode,
			Trigger:      change.trigger,
		}
		if err := tx.CreateOrUpdate(row); err != nil {
			return fmt.Errorf("write Claude Code permission mode change: %w", err)
		}
	}
	return nil
}

// refreshSessionModes re-derives untouched prompts when a mode change or a new observed decision can change them.
func refreshSessionModes(tx dal.Transaction, workspaceKey string, target *sessionTarget, modes sessionModes, promptSequences map[string]int64, observed []observedMode, observedLoaded bool) error {
	where := "workspace_key = ? AND user_key = ? AND session_id = ? AND source_connection_id = ?"
	params := []interface{}{workspaceKey, target.userKey, target.sessionID, target.connectionID}
	if !target.modeChanged {
		where += " AND started_at >= ?"
		params = append(params, target.earliestObserved)
	}
	prompts := make([]*ai.AiPrompt, 0)
	if err := tx.All(&prompts,
		dal.Select("id, prompt_id, started_at, permission_mode, permission_mode_inferred"),
		dal.Where(where, params...),
	); err != nil {
		return fmt.Errorf("load Claude Code session prompts: %w", err)
	}
	if !observedLoaded {
		loaded, err := sessionObservedModes(tx, target)
		if err != nil {
			return err
		}
		observed = loaded
	}
	for _, prompt := range prompts {
		if _, rebuilt := target.promptIDs[prompt.PromptId]; rebuilt {
			continue
		}
		sequence := promptSequences[prompt.PromptId]
		var own *observedMode
		for i := range observed {
			if observed[i].promptID == prompt.PromptId {
				own = &observed[i]
				break
			}
		}
		earlier := earlierObservedMode(observed, prompt.PromptId, prompt.StartedAt, sequence)
		mode, inferred := modes.promptMode(own, earlier, prompt.StartedAt, sequence)
		if mode == prompt.PermissionMode && inferred == prompt.PermissionModeInferred {
			continue
		}
		if err := tx.UpdateColumns(&ai.AiPrompt{}, []dal.DalSet{
			{ColumnName: "permission_mode", Value: mode},
			{ColumnName: "permission_mode_inferred", Value: inferred},
		}, dal.Where("id = ?", prompt.Id)); err != nil {
			return fmt.Errorf("update Claude Code prompt permission mode: %w", err)
		}
	}
	return nil
}

// domainAccountID links prompts to the Claude user's own DevLake account, writing it once
// per session for each email and Claude account ID the session's prompts carry.
func domainAccountID(tx dal.Transaction, cache map[string]string, workspaceKey, userKey string, userAccountID *string, email string) (string, error) {
	cacheKey := email + "\x00"
	if userAccountID != nil {
		cacheKey += *userAccountID
	}
	if accountID, cached := cache[cacheKey]; cached {
		return accountID, nil
	}
	accountID, err := ensureClaudeAccount(tx, workspaceKey, userKey, userAccountID, email)
	if err != nil {
		return "", err
	}
	cache[cacheKey] = accountID
	return accountID, nil
}

// eventAttributes decodes an event's attributes. The decode error is discarded because
// prepareLogRecord always writes Attributes with json.Marshal of a map, so it cannot fail.
// Failing here would also quarantine the wrong batch: the rollup reads events written by
// earlier batches, so one bad row would block every later batch for its session.
func eventAttributes(event *models.OtelEvent) map[string]interface{} {
	attributes := make(map[string]interface{})
	if len(event.Attributes) > 0 {
		_ = json.Unmarshal(event.Attributes, &attributes)
	}
	return attributes
}

func eventString(attributes map[string]interface{}, key string) string {
	value, _ := attributes[key].(string)
	return strings.TrimSpace(value)
}

// eventNumber reads a JSON number or numeric string attribute.
func eventNumber(attributes map[string]interface{}, key string) *int64 {
	switch value := attributes[key].(type) {
	case float64:
		result := int64(value)
		return &result
	case string:
		var parsed float64
		if _, err := fmt.Sscanf(strings.TrimSpace(value), "%g", &parsed); err == nil {
			result := int64(parsed)
			return &result
		}
	}
	return nil
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// baseModelID drops a model ID's snapshot date and variant suffix, so that
// claude-sonnet-4-20250514 and claude-sonnet-4-5[1m] count as claude-sonnet-4 and claude-sonnet-4-5.
// The models_used migration in models/migrationscripts keeps a frozen copy of this rule.
func baseModelID(model string) string {
	return modelVariantSuffix.ReplaceAllString(modelSnapshotDate.ReplaceAllString(strings.TrimSpace(model), ""), "")
}

func sortedKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// createInBatches inserts freshly rebuilt rows rollupInsertBatchSize at a time.
func createInBatches[T any](tx dal.Transaction, rows []T, what string) error {
	for start := 0; start < len(rows); start += rollupInsertBatchSize {
		end := start + rollupInsertBatchSize
		if end > len(rows) {
			end = len(rows)
		}
		if err := tx.Create(rows[start:end]); err != nil {
			return fmt.Errorf("%s: %w", what, err)
		}
	}
	return nil
}
