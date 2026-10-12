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

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
)

var testPromptTarget = promptTarget{workspaceKey: testOrganizationID, userKey: "acct:user_1", sessionID: "session-a", promptID: "prompt-1"}

func promptEvent(name string, offset time.Duration, fill func(*models.OtelPromptEvent)) *models.OtelPromptEvent {
	event := &models.OtelPromptEvent{ConnectionId: 3, EventName: name, EventTime: time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC).Add(offset)}
	if fill != nil {
		fill(event)
	}
	return event
}

func boolPointer(value bool) *bool { return &value }

func TestCanonicalPromptSumsAPromptsEvents(t *testing.T) {
	email := "dev@example.com"
	text := "fix the login bug"
	events := []*models.OtelPromptEvent{
		promptEvent("user_prompt", 0, func(e *models.OtelPromptEvent) {
			e.PromptLength, e.CommandName, e.PromptText, e.UserEmail = 17, "review", &text, &email
		}),
		promptEvent("tool_decision", 2*time.Second, func(e *models.OtelPromptEvent) { e.ToolName, e.Decision = "Write", "accept" }),
		promptEvent("tool_decision", 3*time.Second, func(e *models.OtelPromptEvent) { e.ToolName, e.Decision = "Edit", "reject" }),
		// A Bash decision is not an edit.
		promptEvent("tool_decision", 3*time.Second, func(e *models.OtelPromptEvent) { e.ToolName, e.Decision = "Bash", "accept" }),
		promptEvent("api_request", 4*time.Second, func(e *models.OtelPromptEvent) {
			e.Model, e.DurationMs, e.InputTokens, e.OutputTokens, e.CacheReadTokens, e.CacheCreationTokens, e.CostUsdMicros = "claude-opus-5-5", 3753, 2, 74, 19134, 10, 5315
		}),
		promptEvent("tool_result", 5*time.Second, func(e *models.OtelPromptEvent) { e.DurationMs, e.Success = 81, boolPointer(true) }),
		promptEvent("tool_result", 6*time.Second, func(e *models.OtelPromptEvent) { e.DurationMs, e.Success = 40, boolPointer(false) }),
		// A result without success is a call but neither a success nor a failure.
		promptEvent("tool_result", 6*time.Second, nil),
		promptEvent("api_error", 7*time.Second, func(e *models.OtelPromptEvent) { e.DurationMs = 100 }),
		promptEvent("api_refusal", 8*time.Second, nil),
		promptEvent("api_request", 9*time.Second, func(e *models.OtelPromptEvent) {
			e.Model, e.DurationMs, e.OutputTokens, e.CostUsdMicros = "claude-opus-5-5", 1836, 4, 1_003_936
		}),
	}

	got := canonicalPrompt(testPromptTarget, events)

	if got.Id != ai.CanonicalPromptID(aiProviderClaude, testOrganizationID, "acct:user_1", "session-a", "prompt-1") || got.Provider != aiProviderClaude || got.SourceType != aiSourceOtel {
		t.Fatalf("identity = %q %q %q", got.Id, got.Provider, got.SourceType)
	}
	if got.UserEmail != email || got.PromptLength != 17 || got.CommandName != "review" || got.PromptText == nil || *got.PromptText != text {
		t.Fatalf("prompt = %q %d %q %v", got.UserEmail, got.PromptLength, got.CommandName, got.PromptText)
	}
	if got.WallDurationMs != 9000 || got.ApiDurationMs != 3753+1836+100 || got.ToolDurationMs != 121 || !got.SourceUpdatedAt.Equal(got.EndedAt) {
		t.Fatalf("durations = wall %d, api %d, tool %d", got.WallDurationMs, got.ApiDurationMs, got.ToolDurationMs)
	}
	if got.ApiRequests != 2 || got.Model != "claude-opus-5-5" || got.InputTokens != 2 || got.OutputTokens != 78 || got.CacheReadTokens != 19134 || got.CacheCreationTokens != 10 {
		t.Fatalf("usage = %d requests, %q, tokens %d/%d/%d/%d", got.ApiRequests, got.Model, got.InputTokens, got.OutputTokens, got.CacheReadTokens, got.CacheCreationTokens)
	}
	if got.EstimatedCostUsd != "1.00925100" {
		t.Fatalf("cost = %s, want 1.00925100", got.EstimatedCostUsd)
	}
	if got.ToolCalls != 3 || got.ToolSuccesses != 1 || got.ToolFailures != 1 || got.EditsAccepted != 1 || got.EditsRejected != 1 || got.ApiErrors != 1 || got.ApiRefusals != 1 {
		t.Fatalf("effectiveness = calls %d, ok %d, failed %d, edits %d/%d, errors %d, refusals %d",
			got.ToolCalls, got.ToolSuccesses, got.ToolFailures, got.EditsAccepted, got.EditsRejected, got.ApiErrors, got.ApiRefusals)
	}
	if got.SourceConnectionId == nil || *got.SourceConnectionId != 3 {
		t.Fatalf("SourceConnectionId = %v, want 3", got.SourceConnectionId)
	}
}

func TestCanonicalPromptWithoutOptInHasNoText(t *testing.T) {
	got := canonicalPrompt(testPromptTarget, []*models.OtelPromptEvent{promptEvent("user_prompt", 0, func(e *models.OtelPromptEvent) { e.PromptLength = 40 })})
	if got.PromptText != nil || got.PromptLength != 40 || got.EstimatedCostUsd != "0.00000000" || got.WallDurationMs != 0 {
		t.Fatalf("prompt = %+v, want length only, zero cost and wall time", got)
	}
}

func TestCanonicalPromptPicksTheMostUsedModelDeterministically(t *testing.T) {
	request := func(model string) *models.OtelPromptEvent {
		return promptEvent("api_request", 0, func(e *models.OtelPromptEvent) { e.Model = model })
	}
	if got := canonicalPrompt(testPromptTarget, []*models.OtelPromptEvent{request("haiku"), request("opus"), request("opus")}).Model; got != "opus" {
		t.Errorf("Model = %q, want the model with the most requests", got)
	}
	for i := 0; i < 5; i++ {
		if got := canonicalPrompt(testPromptTarget, []*models.OtelPromptEvent{request("sonnet"), request("haiku")}).Model; got != "haiku" {
			t.Fatalf("Model = %q, want the alphabetically first model on a tie", got)
		}
	}
}

func TestCanonicalPromptAcrossConnectionsHasNoSourceConnection(t *testing.T) {
	second := promptEvent("api_request", time.Second, nil)
	second.ConnectionId = 4
	if got := canonicalPrompt(testPromptTarget, []*models.OtelPromptEvent{promptEvent("user_prompt", 0, nil), second}); got.SourceConnectionId != nil {
		t.Fatalf("SourceConnectionId = %d, want nil for events from two connections", *got.SourceConnectionId)
	}
}

func TestReconcileOtelPromptsWritesThePromptWithItsClaudeAccount(t *testing.T) {
	email := "dev@example.com"
	transaction := dalmocks.NewTransaction(t)
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*[]*models.OtelPromptEvent) = []*models.OtelPromptEvent{promptEvent("user_prompt", 0, func(e *models.OtelPromptEvent) { e.UserEmail = &email })}
	}).Return(nil).Once()
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything).Run(func(args mock.Arguments) {
		account := args.Get(0).(*crossdomain.Account)
		account.Email, account.FullName = email, "Dev Name"
	}).Return(nil).Once()
	transaction.On("CreateOrUpdate", mock.MatchedBy(func(prompt *ai.AiPrompt) bool {
		return prompt.AccountId == claudeAccountID(testOrganizationID, "acct:user_1") && prompt.UserEmail == email && prompt.PromptId == "prompt-1"
	})).Return(nil).Once()

	if err := reconcileOtelPrompts(transaction, []promptTarget{testPromptTarget}); err != nil {
		t.Fatalf("reconcileOtelPrompts() error = %v", err)
	}
}

func TestReconcileOtelPromptsSkipsPromptsWithoutEvents(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()

	if err := reconcileOtelPrompts(transaction, []promptTarget{testPromptTarget}); err != nil {
		t.Fatalf("reconcileOtelPrompts() error = %v", err)
	}
}

func TestReconcileOtelPromptsReturnsLoadError(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	transaction.On("All", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(errors.Default.New("connection lost")).Once()

	if err := reconcileOtelPrompts(transaction, []promptTarget{testPromptTarget}); err == nil {
		t.Fatal("reconcileOtelPrompts() error = nil, want the load error")
	}
}
