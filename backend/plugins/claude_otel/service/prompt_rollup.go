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
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

// rollupEventColumns are the event columns the rollup reads. prompt_text is left out, so
// prompt text can never reach ai_* tables and large texts are not loaded per rollup.
var rollupEventColumns = dal.Select("event_key, connection_id, user_key, user_account_id, user_email, session_id, prompt_id, " +
	"event_name, event_sequence, event_timestamp, model, tool_name, skill_name, plugin_name, success, cost_usd, " +
	"input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, attributes")

const (
	// planCommand enters plan mode without a permission_mode_changed event.
	planCommand         = "plan"
	skillToolName       = "Skill"
	toolDecisionReject  = "reject"
	maxModelsUsedLength = 1024
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
		if event.SessionId != "" && isModeChangeEvent(event) {
			target.modeChanged = true
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

// isModeChangeEvent reports whether an event switches the session's permission mode.
// Claude Code reports Shift+Tab and plan-mode exits as permission_mode_changed, but
// entering plan mode with /plan only as the user_prompt of that command.
func isModeChangeEvent(event *models.OtelEvent) bool {
	if event.EventName == eventPermissionModeChanged {
		return true
	}
	return event.EventName == eventUserPrompt && eventString(eventAttributes(event), "command_name") == planCommand
}

func newSessionModes(events []*models.OtelEvent) sessionModes {
	changes := make([]modeChange, 0)
	for _, event := range events {
		if !isModeChangeEvent(event) {
			continue
		}
		attributes := eventAttributes(event)
		change := modeChange{at: event.EventTimestamp, sequence: int64Value(event.EventSequence)}
		if event.EventName == eventPermissionModeChanged {
			change.fromMode = eventString(attributes, "from_mode")
			change.toMode = eventString(attributes, "to_mode")
			change.trigger = eventString(attributes, "trigger")
		} else {
			// The mode before /plan is unknown; prompts before it fall back to the default.
			change.toMode = ai.PermissionModePlan
			change.trigger = "plan_command"
		}
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

// promptRollup is one prompt's facts derived from its events.
type promptRollup struct {
	prompt *ai.AiPrompt
	skills []*ai.AiPromptSkill
}

// buildPromptRollup derives one prompt row and its skills from the prompt's events. The
// caller sets the permission mode and the DevLake account.
func buildPromptRollup(workspaceKey, promptID string, events []*models.OtelEvent) promptRollup {
	sort.SliceStable(events, func(i, j int) bool {
		return lessEventOrder(events[i].EventTimestamp, int64Value(events[i].EventSequence), events[j].EventTimestamp, int64Value(events[j].EventSequence))
	})
	prompt := &ai.AiPrompt{
		DomainEntity:     domainlayer.NewDomainEntity(ai.PromptID(aiProviderClaude, workspaceKey, promptID)),
		Provider:         aiProviderClaude,
		WorkspaceKey:     workspaceKey,
		PromptId:         promptID,
		EstimatedCostUsd: "0.00000000",
		SourceType:       aiSourceOtel,
	}
	skills := newSkillCollector(workspaceKey, promptID)
	modelNames := make([]string, 0)
	seenModels := make(map[string]struct{})
	for index, event := range events {
		if index == 0 {
			prompt.StartedAt = event.EventTimestamp
			fillPromptIdentity(prompt, event)
		}
		prompt.EndedAt = latestTime(prompt.EndedAt, event.EventTimestamp)
		attributes := eventAttributes(event)
		switch event.EventName {
		case eventUserPrompt:
			// The user_prompt event marks the start, even when an earlier-stamped event of
			// the same prompt arrived.
			prompt.StartedAt = event.EventTimestamp
			fillPromptIdentity(prompt, event)
			prompt.PromptLength = int64Value(eventNumber(attributes, "prompt_length"))
			prompt.CommandName = eventString(attributes, "command_name")
			prompt.CommandSource = eventString(attributes, "command_source")
		case eventAPIRequest:
			prompt.ApiRequestCount++
			prompt.InputTokens += event.InputTokens
			prompt.OutputTokens += event.OutputTokens
			prompt.CacheReadTokens += event.CacheReadTokens
			prompt.CacheCreationTokens += event.CacheCreationTokens
			if event.CostUsd != nil {
				if total, err := addDecimal(prompt.EstimatedCostUsd, *event.CostUsd, 8); err == nil {
					prompt.EstimatedCostUsd = total
				}
			}
			if _, seen := seenModels[event.Model]; event.Model != "" && !seen {
				seenModels[event.Model] = struct{}{}
				modelNames = append(modelNames, event.Model)
			}
			skills.add(event.SkillName, ai.SkillDetectedViaApiRequest, "", "", event.PluginName, event.EventTimestamp)
		case eventAPIError:
			prompt.ApiErrorCount++
		case eventToolResult:
			prompt.ToolCallCount++
			if event.Success != nil && !*event.Success {
				prompt.ToolFailureCount++
			}
			if _, subagent := subagentToolNames[event.ToolName]; subagent {
				prompt.SubagentCount++
			}
			if event.ToolName == skillToolName {
				skills.add(event.SkillName, ai.SkillDetectedViaSkillTool, "", "", "", event.EventTimestamp)
			}
		case eventToolDecision:
			if eventString(attributes, "decision") == toolDecisionReject {
				prompt.ToolRejectCount++
			}
		case eventSkillActivated:
			skills.add(event.SkillName, ai.SkillDetectedViaActivation, eventString(attributes, "invocation_trigger"), eventString(attributes, "skill.source"), event.PluginName, event.EventTimestamp)
		}
	}
	prompt.ModelsUsed = truncate(strings.Join(modelNames, ","), maxModelsUsedLength)
	collected := skills.result(prompt)
	prompt.SkillCount = int64(len(collected))
	prompt.UsedSkill = len(collected) > 0
	return promptRollup{prompt: prompt, skills: collected}
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
			DomainEntity: domainlayer.NewDomainEntity(ai.PromptSkillID(aiProviderClaude, c.workspaceKey, c.promptID, name)),
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
	if skillSourceRank[detectedVia] > skillSourceRank[skill.DetectedVia] {
		skill.DetectedVia = detectedVia
	}
	if at.Before(skill.FirstUsedAt) {
		skill.FirstUsedAt = at
	}
	skill.InvocationTrigger = firstNonEmpty(skill.InvocationTrigger, trigger)
	skill.SkillSource = firstNonEmpty(skill.SkillSource, source)
	skill.PluginName = firstNonEmpty(skill.PluginName, plugin)
}

func (c *skillCollector) result(prompt *ai.AiPrompt) []*ai.AiPromptSkill {
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
// session's mode history, the mode of every prompt in that session.
func rollupSessions(tx dal.Transaction, workspaceKeys map[uint64]string, targets []*sessionTarget) error {
	for _, target := range targets {
		workspaceKey := workspaceKeys[target.connectionID]
		if workspaceKey == "" {
			continue
		}
		if err := rollupSession(tx, workspaceKey, target); err != nil {
			return err
		}
	}
	return nil
}

func rollupSession(tx dal.Transaction, workspaceKey string, target *sessionTarget) error {
	modes := sessionModes{}
	promptSequences := make(map[string]int64)
	if target.sessionID != "" {
		// Mode changes and the session's user_prompt events, one per prompt, are enough to
		// derive every prompt's mode.
		sessionEvents := make([]*models.OtelEvent, 0)
		if err := tx.All(&sessionEvents, rollupEventColumns, dal.Where("connection_id = ? AND user_key = ? AND session_id = ? AND event_name IN ?",
			target.connectionID, target.userKey, target.sessionID, []string{eventPermissionModeChanged, eventUserPrompt})); err != nil {
			return fmt.Errorf("load Claude Code session mode events: %w", err)
		}
		modes = newSessionModes(sessionEvents)
		if err := writeModeChanges(tx, workspaceKey, target, sessionEvents, modes); err != nil {
			return err
		}
		for _, event := range sessionEvents {
			if event.EventName == eventUserPrompt {
				promptSequences[event.PromptId] = int64Value(event.EventSequence)
			}
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
		rollup.prompt.PermissionMode, rollup.prompt.PermissionModeInferred = modes.modeAt(rollup.prompt.StartedAt, promptSequence(events))
		accountID, err := domainAccountID(tx, accounts, rollup.prompt.UserEmail)
		if err != nil {
			return err
		}
		rollup.prompt.AccountId = accountID
		if err := writePromptRollup(tx, rollup); err != nil {
			return err
		}
	}
	if target.modeChanged {
		return refreshSessionModes(tx, workspaceKey, target, modes, promptSequences)
	}
	return nil
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
		return classifyStorageError(fmt.Errorf("write Claude Code prompt: %w", err))
	}
	if err := tx.Delete(&ai.AiPromptSkill{}, dal.Where("workspace_key = ? AND prompt_id = ?", rollup.prompt.WorkspaceKey, rollup.prompt.PromptId)); err != nil {
		return classifyStorageError(fmt.Errorf("clear Claude Code prompt skills: %w", err))
	}
	for _, skill := range rollup.skills {
		if err := tx.CreateOrUpdate(skill); err != nil {
			return classifyStorageError(fmt.Errorf("write Claude Code prompt skill: %w", err))
		}
	}
	return nil
}

func writeModeChanges(tx dal.Transaction, workspaceKey string, target *sessionTarget, events []*models.OtelEvent, modes sessionModes) error {
	email := ""
	for _, event := range events {
		email = firstNonEmpty(email, stringValue(event.UserEmail))
	}
	for _, change := range modes.changes {
		row := &ai.AiPermissionModeChange{
			DomainEntity: domainlayer.NewDomainEntity(ai.PermissionModeChangeID(aiProviderClaude, workspaceKey, target.sessionID, change.at, change.fromMode, change.toMode)),
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
			return classifyStorageError(fmt.Errorf("write Claude Code permission mode change: %w", err))
		}
	}
	return nil
}

// refreshSessionModes re-derives the mode of the session's prompts that the batch did not
// touch, because a new mode change can reveal the mode of earlier prompts.
func refreshSessionModes(tx dal.Transaction, workspaceKey string, target *sessionTarget, modes sessionModes, promptSequences map[string]int64) error {
	prompts := make([]*ai.AiPrompt, 0)
	if err := tx.All(&prompts,
		dal.Select("id, prompt_id, started_at, permission_mode, permission_mode_inferred"),
		dal.Where("workspace_key = ? AND user_key = ? AND session_id = ? AND source_connection_id = ?", workspaceKey, target.userKey, target.sessionID, target.connectionID),
	); err != nil {
		return fmt.Errorf("load Claude Code session prompts: %w", err)
	}
	for _, prompt := range prompts {
		if _, rebuilt := target.promptIDs[prompt.PromptId]; rebuilt {
			continue
		}
		mode, inferred := modes.modeAt(prompt.StartedAt, promptSequences[prompt.PromptId])
		if mode == prompt.PermissionMode && inferred == prompt.PermissionModeInferred {
			continue
		}
		if err := tx.UpdateColumns(&ai.AiPrompt{}, []dal.DalSet{
			{ColumnName: "permission_mode", Value: mode},
			{ColumnName: "permission_mode_inferred", Value: inferred},
		}, dal.Where("id = ?", prompt.Id)); err != nil {
			return classifyStorageError(fmt.Errorf("update Claude Code prompt permission mode: %w", err))
		}
	}
	return nil
}

// domainAccountID links prompts to a DevLake account by email, caching per session.
func domainAccountID(tx dal.Transaction, cache map[string]string, email string) (string, error) {
	if email == "" {
		return "", nil
	}
	if accountID, cached := cache[email]; cached {
		return accountID, nil
	}
	account := &crossdomain.Account{}
	if err := tx.First(account, dal.Where("email = ?", email), dal.Orderby("id ASC")); err != nil {
		if !tx.IsErrorNotFound(err) {
			return "", fmt.Errorf("resolve Claude Code prompt account: %w", err)
		}
		account.Id = ""
	}
	cache[email] = account.Id
	return account.Id, nil
}

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

func sortedKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
