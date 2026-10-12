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
	"fmt"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

// editTools are the tools whose accept/reject decisions count as edit acceptance.
var editTools = map[string]struct{}{"Edit": {}, "MultiEdit": {}, "Write": {}, "NotebookEdit": {}}

// reconcileOtelPrompts rebuilds each touched ai_prompts row from all of the prompt's
// events. Like the other canonical facts, the row has no connection component.
func reconcileOtelPrompts(tx dal.Transaction, targets []promptTarget) error {
	accounts := make(map[string]string)
	for _, target := range targets {
		events := make([]*models.OtelPromptEvent, 0)
		if err := tx.All(&events,
			dal.From(&models.OtelPromptEvent{}),
			dal.Where("organization_id = ? AND user_key = ? AND session_id = ? AND prompt_id = ?", target.workspaceKey, target.userKey, target.sessionID, target.promptID),
			dal.Orderby("event_time ASC, sequence ASC, id ASC"),
		); err != nil {
			return fmt.Errorf("load Claude OTel prompt events: %w", err)
		}
		if len(events) == 0 {
			continue
		}
		prompt := canonicalPrompt(target, events)
		accountKey := target.workspaceKey + "\x00" + target.userKey
		accountID, cached := accounts[accountKey]
		if !cached {
			var err error
			if accountID, err = ensureClaudeAccount(tx, target.workspaceKey, target.userKey, target.userAccountID, prompt.UserEmail); err != nil {
				return err
			}
			accounts[accountKey] = accountID
		}
		prompt.AccountId = accountID
		if err := tx.CreateOrUpdate(prompt); err != nil {
			return fmt.Errorf("write canonical Claude prompt: %w", err)
		}
	}
	return nil
}

// canonicalPrompt sums one prompt's events. Wall time runs from the first event (the
// prompt itself) to the last; the model is the one that served most API requests.
func canonicalPrompt(target promptTarget, events []*models.OtelPromptEvent) *ai.AiPrompt {
	prompt := &ai.AiPrompt{
		DomainEntity:  domainlayer.NewDomainEntity(ai.CanonicalPromptID(aiProviderClaude, target.workspaceKey, target.userKey, target.sessionID, target.promptID)),
		Provider:      aiProviderClaude,
		WorkspaceKey:  target.workspaceKey,
		UserKey:       target.userKey,
		UserAccountId: target.userAccountID,
		SessionId:     target.sessionID,
		PromptId:      target.promptID,
		SourceType:    aiSourceOtel,
	}
	modelRequests := make(map[string]int)
	connections := make(map[uint64]struct{})
	var costMicros int64
	for _, event := range events {
		connections[event.ConnectionId] = struct{}{}
		if prompt.UserEmail == "" && event.UserEmail != nil {
			prompt.UserEmail = *event.UserEmail
		}
		if prompt.StartedAt.IsZero() || event.EventTime.Before(prompt.StartedAt) {
			prompt.StartedAt = event.EventTime
		}
		if event.EventTime.After(prompt.EndedAt) {
			prompt.EndedAt = event.EventTime
		}
		switch claudeCodeEventScope + event.EventName {
		case eventUserPrompt:
			if event.PromptLength > prompt.PromptLength {
				prompt.PromptLength = event.PromptLength
			}
			prompt.CommandName = firstNonEmpty(prompt.CommandName, event.CommandName)
			if prompt.PromptText == nil && event.PromptText != nil {
				prompt.PromptText = event.PromptText
			}
		case eventAPIRequest:
			prompt.ApiRequests++
			prompt.ApiDurationMs += event.DurationMs
			prompt.InputTokens += event.InputTokens
			prompt.OutputTokens += event.OutputTokens
			prompt.CacheReadTokens += event.CacheReadTokens
			prompt.CacheCreationTokens += event.CacheCreationTokens
			costMicros += event.CostUsdMicros
			if event.Model != "" {
				modelRequests[event.Model]++
			}
		case eventAPIError:
			prompt.ApiErrors++
			prompt.ApiDurationMs += event.DurationMs
		case eventAPIRefusal:
			prompt.ApiRefusals++
		case eventToolResult:
			prompt.ToolCalls++
			prompt.ToolDurationMs += event.DurationMs
			if event.Success != nil && *event.Success {
				prompt.ToolSuccesses++
			} else if event.Success != nil {
				prompt.ToolFailures++
			}
		case eventToolDecision:
			if _, edit := editTools[event.ToolName]; edit {
				switch event.Decision {
				case "accept":
					prompt.EditsAccepted++
				case "reject":
					prompt.EditsRejected++
				}
			}
		}
	}
	for model, requests := range modelRequests {
		if requests > modelRequests[prompt.Model] || (requests == modelRequests[prompt.Model] && model < prompt.Model) {
			prompt.Model = model
		}
	}
	prompt.WallDurationMs = prompt.EndedAt.Sub(prompt.StartedAt).Milliseconds()
	prompt.EstimatedCostUsd = fmt.Sprintf("%d.%06d00", costMicros/1_000_000, costMicros%1_000_000)
	prompt.SourceUpdatedAt = prompt.EndedAt
	if len(connections) == 1 {
		connectionID := events[0].ConnectionId
		prompt.SourceConnectionId = &connectionID
	}
	return prompt
}
