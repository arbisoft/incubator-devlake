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
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	"google.golang.org/protobuf/proto"
)

func whereExpr(clauses []dal.Clause, index int) string {
	return clauses[index].Data.(dal.DalClause).Expr
}

func whereParams(clauses []dal.Clause, index int) []interface{} {
	return clauses[index].Data.(dal.DalClause).Params
}

func columnSets(sets []dal.DalSet) map[string]interface{} {
	values := make(map[string]interface{}, len(sets))
	for _, set := range sets {
		values[set.ColumnName] = set.Value
	}
	return values
}

func otelEventWith(name, promptID string, at time.Time, sequence int64, attributes map[string]string) *models.OtelEvent {
	encoded, _ := json.Marshal(attributes)
	return &models.OtelEvent{EventName: name, SessionId: "sess-1", PromptId: promptID, EventTimestamp: at, EventSequence: &sequence, Attributes: encoded}
}

// storedPrompt is an ai_prompts row an earlier batch wrote for session sess-1.
func storedPrompt(promptID string, startedAt time.Time, mode string, inferred bool) *ai.AiPrompt {
	return &ai.AiPrompt{
		DomainEntity:           domainlayer.DomainEntity{Id: "prompt-" + promptID},
		PromptId:               promptID,
		StartedAt:              startedAt,
		PermissionMode:         mode,
		PermissionModeInferred: inferred,
	}
}

// A mode change in a later batch reveals the mode of prompts an earlier batch stored, so
// their stored mode must be re-derived even though this batch did not touch them.
func TestRollupSessionRederivesEarlierPromptModesOnLaterModeChange(t *testing.T) {
	at := func(minute int) time.Time { return time.Date(2026, 10, 14, 10, minute, 0, 0, time.UTC) }
	// The session switches from plan to acceptEdits at minute 5, sequence 50.
	modeChange := otelEventWith(eventPermissionModeChanged, "", at(5), 50, map[string]string{"from_mode": "plan", "to_mode": "acceptEdits"})
	// prompts is the session's stored prompts and the mode each must end with. A prompt
	// already stored with its right mode is not updated.
	prompts := []struct {
		id, storedMode, wantMode string
		minute                   int
		storedInferred           bool
	}{
		// Before the change, the prompt ran in its from_mode.
		{id: "p1", minute: 1, storedMode: ai.PermissionModeDefault, storedInferred: true, wantMode: "plan"},
		{id: "p2", minute: 6, storedMode: ai.PermissionModeDefault, storedInferred: true, wantMode: "acceptEdits"},
		{id: "p3", minute: 7, storedMode: "acceptEdits", wantMode: "acceptEdits"},
	}
	promptEvents := make([]*models.OtelEvent, 0, len(prompts))
	stored := make([]*ai.AiPrompt, 0, len(prompts))
	wantUpdates := make(map[string]map[string]interface{})
	for _, prompt := range prompts {
		promptEvents = append(promptEvents, otelEventWith(eventUserPrompt, prompt.id, at(prompt.minute), int64(prompt.minute*10), nil))
		row := storedPrompt(prompt.id, at(prompt.minute), prompt.storedMode, prompt.storedInferred)
		stored = append(stored, row)
		if prompt.storedMode != prompt.wantMode || prompt.storedInferred {
			wantUpdates[row.Id] = map[string]interface{}{"permission_mode": prompt.wantMode, "permission_mode_inferred": false}
		}
	}

	tx := dalmocks.NewTransaction(t)
	tx.EXPECT().All(mock.Anything, mock.Anything, mock.Anything).Run(func(result interface{}, clauses ...dal.Clause) {
		where := whereExpr(clauses, 1)
		switch {
		case strings.Contains(where, "command_name = ?"):
			*result.(*[]*models.OtelEvent) = []*models.OtelEvent{modeChange}
		case strings.Contains(where, "event_name = ?"):
			*result.(*[]*models.OtelEvent) = promptEvents
		case strings.Contains(where, "source_connection_id = ?"):
			*result.(*[]*ai.AiPrompt) = stored
		default:
			t.Fatalf("unexpected load %q", where)
		}
	}).Return(nil).Times(3)
	tx.EXPECT().CreateOrUpdate(mock.AnythingOfType("*ai.AiPermissionModeChange")).Return(nil).Once()
	updated := make(map[string]map[string]interface{})
	tx.EXPECT().UpdateColumns(mock.AnythingOfType("*ai.AiPrompt"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, clauses ...dal.Clause) {
		updated[whereParams(clauses, 0)[0].(string)] = columnSets(sets)
	}).Return(nil)

	target := &sessionTarget{connectionID: 1, userKey: "uuid:u1", sessionID: "sess-1", promptIDs: map[string]struct{}{}, modeChanged: true}
	if err := rollupSession(tx, testOrganizationID, target); err != nil {
		t.Fatalf("rollupSession() error = %v", err)
	}
	if !reflect.DeepEqual(updated, wantUpdates) {
		t.Fatalf("updated prompts = %v, want %v", updated, wantUpdates)
	}
}

func TestRollupSessionWithoutSessionIDSkipsModeQueries(t *testing.T) {
	at := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	tx := dalmocks.NewTransaction(t)
	tx.EXPECT().All(mock.Anything, mock.Anything, mock.Anything).Run(func(result interface{}, clauses ...dal.Clause) {
		if where := whereExpr(clauses, 1); !strings.Contains(where, "prompt_id = ?") {
			t.Fatalf("unexpected load %q", where)
		}
		event := otelEventWith(eventUserPrompt, "p1", at, 1, nil)
		event.SessionId = ""
		*result.(*[]*models.OtelEvent) = []*models.OtelEvent{event}
	}).Return(nil).Once()
	var written *ai.AiPrompt
	tx.EXPECT().CreateOrUpdate(mock.AnythingOfType("*ai.AiPrompt")).Run(func(entity interface{}, _ ...dal.Clause) {
		written = entity.(*ai.AiPrompt)
	}).Return(nil).Once()
	tx.EXPECT().Delete(mock.AnythingOfType("*ai.AiPromptSkill"), mock.Anything).Return(nil).Once()
	tx.EXPECT().Delete(mock.AnythingOfType("*ai.AiPromptFailure"), mock.Anything).Return(nil).Once()
	expectStoredAccount(tx, &crossdomain.Account{})

	target := &sessionTarget{connectionID: 1, userKey: "uuid:u1", promptIDs: map[string]struct{}{"p1": {}}}
	if err := rollupSession(tx, testOrganizationID, target); err != nil {
		t.Fatalf("rollupSession() error = %v", err)
	}
	if written == nil || written.PermissionMode != ai.PermissionModeDefault || !written.PermissionModeInferred {
		t.Fatalf("written prompt = %#v, want inferred default mode", written)
	}
	if wantAccountID := claudeAccountID(testOrganizationID, written.UserKey); written.AccountId != wantAccountID {
		t.Fatalf("written prompt account = %q, want %q", written.AccountId, wantAccountID)
	}
}

func TestRollupSessionLoadsAndWritesModesOnlyWhenNeeded(t *testing.T) {
	at := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	for _, modeChanged := range []bool{false, true} {
		t.Run(fmt.Sprintf("modeChanged=%t", modeChanged), func(t *testing.T) {
			tx := dalmocks.NewTransaction(t)
			loads := make([]string, 0)
			tx.EXPECT().All(mock.Anything, mock.Anything, mock.Anything).Run(func(result interface{}, clauses ...dal.Clause) {
				where := clauses[1].Data.(dal.DalClause).Expr
				loads = append(loads, where)
				switch {
				case strings.Contains(where, "command_name = ?"):
					attributes, _ := json.Marshal(map[string]string{"from_mode": "default", "to_mode": "plan"})
					*result.(*[]*models.OtelEvent) = []*models.OtelEvent{{EventName: eventPermissionModeChanged, EventTimestamp: at, Attributes: attributes}}
				case strings.Contains(where, "prompt_id = ?"):
					*result.(*[]*models.OtelEvent) = []*models.OtelEvent{{EventName: eventUserPrompt, SessionId: "sess-1", PromptId: "p1", EventTimestamp: at.Add(time.Minute)}}
				}
			}).Return(nil)
			tx.EXPECT().CreateOrUpdate(mock.AnythingOfType("*ai.AiPrompt")).Return(nil).Once()
			tx.EXPECT().Delete(mock.AnythingOfType("*ai.AiPromptSkill"), mock.Anything).Return(nil).Once()
			tx.EXPECT().Delete(mock.AnythingOfType("*ai.AiPromptFailure"), mock.Anything).Return(nil).Once()
			expectStoredAccount(tx, &crossdomain.Account{})
			if modeChanged {
				tx.EXPECT().CreateOrUpdate(mock.AnythingOfType("*ai.AiPermissionModeChange")).Return(nil).Once()
			}

			target := &sessionTarget{connectionID: 1, userKey: "uuid:u1", sessionID: "sess-1", promptIDs: map[string]struct{}{"p1": {}}, modeChanged: modeChanged}
			if err := rollupSession(tx, testOrganizationID, target); err != nil {
				t.Fatalf("rollupSession() error = %v", err)
			}
			if !strings.Contains(loads[0], "command_name = ?") {
				t.Fatalf("first load = %q, want only the session's mode changes", loads[0])
			}
			sessionPromptLoads := 0
			for _, where := range loads {
				if strings.Contains(where, "event_name = ?") && !strings.Contains(where, "command_name") {
					sessionPromptLoads++
				}
			}
			wantLoads, wantPromptLoads := 2, 0
			if modeChanged {
				// The prompt sequences and the session's prompts for refreshSessionModes.
				wantLoads, wantPromptLoads = 4, 1
			}
			if len(loads) != wantLoads || sessionPromptLoads != wantPromptLoads {
				t.Fatalf("loads = %q, want %d loads with %d session prompt sequence load(s)", loads, wantLoads, wantPromptLoads)
			}
		})
	}
}

func TestDomainAccountIDWritesClaudeAccountOncePerIdentity(t *testing.T) {
	userAccountID := "user_1"
	tx := dalmocks.NewTransaction(t)
	expectNoStoredAccount(tx)
	expectNameLookup(tx, "Dev Name")
	expectAccountWrite(tx, "dev@example.com", userAccountID, "Dev Name")
	cache := make(map[string]string)

	for attempt := 0; attempt < 2; attempt++ {
		accountID, err := domainAccountID(tx, cache, testOrganizationID, testUserKey, &userAccountID, "dev@example.com")
		if err != nil || accountID != testClaudeAccountID {
			t.Fatalf("domainAccountID() = %q, %v; want %q", accountID, err, testClaudeAccountID)
		}
	}
}

func TestDomainAccountIDRewritesAccountForNewEmail(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	expectNoStoredAccount(tx)
	expectAccountWrite(tx, "", "", "")
	expectStoredAccount(tx, &crossdomain.Account{})
	expectNameLookup(tx, "Dev Name")
	expectAccountWrite(tx, "dev@example.com", "", "Dev Name")
	cache := make(map[string]string)

	for _, email := range []string{"", "dev@example.com"} {
		if accountID, err := domainAccountID(tx, cache, testOrganizationID, testUserKey, nil, email); err != nil || accountID != testClaudeAccountID {
			t.Fatalf("domainAccountID(email %q) = %q, %v", email, accountID, err)
		}
	}
}

func TestDomainAccountIDReturnsAccountErrors(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	failure := errors.Default.New("database unavailable")
	tx.EXPECT().First(mock.AnythingOfType("*crossdomain.Account"), mock.Anything).Return(failure).Once()
	tx.EXPECT().IsErrorNotFound(failure).Return(false).Once()

	if _, err := domainAccountID(tx, make(map[string]string), testOrganizationID, testUserKey, nil, "dev@example.com"); err == nil {
		t.Fatal("domainAccountID() error = nil, want the account error")
	}
}

func TestRecordLogBatchFailureStates(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name      string
		attempts  int
		err       error
		code      conversionErrorCode
		status    string
		processed bool
	}{
		{"retryable", 1, &conversionError{code: errorStorageFailure, err: fmt.Errorf("deadlock")}, errorStorageFailure, models.OtelBatchStatusRetryableError, false},
		{"permanent", 1, permanentConversionError(errorInvalidPayload, "bad payload"), errorInvalidPayload, models.OtelBatchStatusPermanentError, true},
		{"retries exhausted", converterMaxAttempts, &conversionError{code: errorStorageFailure, err: fmt.Errorf("deadlock")}, errorRetryExhausted, models.OtelBatchStatusPermanentError, true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database := dalmocks.NewDal(t)
			var columns map[string]interface{}
			database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
				columns = columnSets(sets)
			}).Return(nil).Once()
			converter := newRawConverter(database, nil)
			converter.now = func() time.Time { return now }

			if err := converter.recordBatchFailure(&batchLease{table: &models.OtelLogBatch{}, id: 3, attempts: test.attempts, owner: "worker"}, test.err); err != nil {
				t.Fatalf("recordBatchFailure() error = %v", err)
			}
			if columns["status"] != test.status || columns["processing_error_code"] != string(test.code) || columns["lease_owner"] != nil {
				t.Fatalf("columns = %v, want status %s code %s", columns, test.status, test.code)
			}
			_, hasProcessedAt := columns["processed_at"]
			_, hasNextAttempt := columns["next_attempt_at"]
			if hasProcessedAt != test.processed || hasNextAttempt == test.processed {
				t.Fatalf("columns = %v, want processed_at %t and next_attempt_at %t", columns, test.processed, !test.processed)
			}
		})
	}
}

func TestRecordLogBatchFailureLeavesLostLeaseAlone(t *testing.T) {
	converter := newRawConverter(dalmocks.NewDal(t), nil)
	if err := converter.recordBatchFailure(&batchLease{table: &models.OtelLogBatch{}, id: 3, attempts: 1, owner: "worker"}, &conversionError{code: errorLeaseLost, err: fmt.Errorf("lease taken")}); err != nil {
		t.Fatalf("recordBatchFailure() error = %v", err)
	}
}

func TestClaimNextLogBatchWaitsBehindRetryDelayedHead(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	nextAttemptAt := now.Add(time.Minute)
	database := dalmocks.NewDal(t)
	expectClaimHead(database, &rawBatchHead{ID: 4, ReceivedAt: now.Add(-time.Hour), Status: models.OtelBatchStatusRetryableError, NextAttemptAt: &nextAttemptAt}).Once()
	// No replay backlog.
	expectClaimHead(database, nil).Once()
	converter := newRawConverter(database, nil)
	converter.now = func() time.Time { return now }

	batch, _, err := converter.claimNextLogBatch()
	if err != nil || batch != nil {
		t.Fatalf("claimNextLogBatch() = %#v, %v; want no claim while the head waits for retry", batch, err)
	}
}

// A replay backlog is converted only while no live batch is claimable, so it never
// delays new events.
func TestClaimNextLogBatchClaimsReplayBacklogOnlyAfterLiveQueue(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	database := dalmocks.NewDal(t)
	var queries []dal.DalClause
	database.EXPECT().All(mock.AnythingOfType("*[]*service.rawBatchHead"), mock.Anything, mock.Anything, mock.Anything).Run(
		func(heads interface{}, clauses ...dal.Clause) {
			queries = append(queries, clauses[0].Data.(dal.DalClause))
			if len(queries) == 2 {
				*heads.(*[]*rawBatchHead) = []*rawBatchHead{{ID: 2, ReceivedAt: now.AddDate(0, 0, -3), Status: models.OtelBatchStatusReplayPending}}
			}
		},
	).Return(nil).Times(2)
	var claim map[string]interface{}
	var claimWhere dal.DalClause
	database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, clauses ...dal.Clause) {
		claim = columnSets(sets)
		claimWhere = clauses[0].Data.(dal.DalClause)
	}).Return(nil).Once()
	database.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Run(func(batch interface{}, _ ...dal.Clause) {
		*batch.(*models.OtelLogBatch) = models.OtelLogBatch{Model: common.Model{ID: 2}, Status: models.OtelBatchStatusReplayPending}
	}).Return(nil).Once()
	converter := newRawConverter(database, nil)
	converter.now = func() time.Time { return now }

	batch, lease, err := converter.claimNextLogBatch()
	if err != nil || batch == nil || batch.ID != 2 || lease == nil || lease.attempts != 1 || !lease.replayed() {
		t.Fatalf("claimNextLogBatch() = %#v, %#v, %v; want replayed batch 2 leased for attempt 1", batch, lease, err)
	}
	if len(queries[0].Params) != len(nonterminalBatchStatuses) {
		t.Fatalf("first claim query params = %v, want the live statuses %v", queries[0].Params, nonterminalBatchStatuses)
	}
	for i, status := range nonterminalBatchStatuses {
		if queries[0].Params[i] != status {
			t.Fatalf("first claim query params = %v, want the live statuses %v", queries[0].Params, nonterminalBatchStatuses)
		}
	}
	// The replay lookup skips batches that are leased or waiting for their retry, so one of
	// them does not hold back the rest of the replay.
	replayLookup := queries[1]
	if !strings.Contains(replayLookup.Expr, "(next_attempt_at IS NULL OR next_attempt_at <= ?) AND (lease_until IS NULL OR lease_until < ?)") ||
		len(replayLookup.Params) != 3 || replayLookup.Params[0] != models.OtelBatchStatusReplayPending ||
		replayLookup.Params[1] != now || replayLookup.Params[2] != now {
		t.Fatalf("replay claim query = %s %v; want only due, unleased replay_pending batches", replayLookup.Expr, replayLookup.Params)
	}
	// The claimed batch stays replay_pending, so it never enters the live queue or backlog.
	if claim["status"] != models.OtelBatchStatusReplayPending || claim["lease_owner"] != lease.owner || claimWhere.Params[1] != models.OtelBatchStatusReplayPending {
		t.Fatalf("claim columns = %v where %v; want the lease taken with the batch kept replay_pending", claim, claimWhere.Params)
	}
}

// A replayed batch keeps replay_pending through every failure, so it never becomes the head
// of the live queue nor counts as live backlog with its old received_at. A permanent failure
// sets processed_at, so it is reported as a recent error even when the batch converted before.
func TestRecordReplayedLogBatchFailureStaysInReplayQueue(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name     string
		attempts int
		err      error
		status   string
		retry    bool
	}{
		{"retryable", 1, &conversionError{code: errorStorageFailure, err: fmt.Errorf("deadlock")}, models.OtelBatchStatusReplayPending, true},
		{"permanent", 1, permanentConversionError(errorInvalidPayload, "bad payload"), models.OtelBatchStatusPermanentError, false},
		{"retries exhausted", converterMaxAttempts, &conversionError{code: errorStorageFailure, err: fmt.Errorf("deadlock")}, models.OtelBatchStatusPermanentError, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database := dalmocks.NewDal(t)
			var columns map[string]interface{}
			var where dal.DalClause
			database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, clauses ...dal.Clause) {
				columns = columnSets(sets)
				where = clauses[0].Data.(dal.DalClause)
			}).Return(nil).Once()
			converter := newRawConverter(database, nil)
			converter.now = func() time.Time { return now }
			lease := &batchLease{table: &models.OtelLogBatch{}, id: 3, attempts: test.attempts, owner: "worker", status: models.OtelBatchStatusReplayPending}

			if err := converter.recordBatchFailure(lease, test.err); err != nil {
				t.Fatalf("recordBatchFailure() error = %v", err)
			}
			for _, status := range nonterminalBatchStatuses {
				if columns["status"] == status {
					t.Fatalf("status = %v; a replayed batch must not take a live queue status", columns["status"])
				}
			}
			if columns["status"] != test.status || where.Params[1] != models.OtelBatchStatusReplayPending || columns["lease_owner"] != nil {
				t.Fatalf("columns = %v where %v; want status %s, matched on replay_pending", columns, where.Params, test.status)
			}
			if _, retry := columns["next_attempt_at"]; retry != test.retry {
				t.Fatalf("columns = %v; want next_attempt_at set = %t", columns, test.retry)
			}
			if _, set := columns["processed_at"]; set == test.retry {
				t.Fatalf("columns = %v; want processed_at set = %t", columns, !test.retry)
			}
		})
	}
}

// The scenario the replay queue exists for: a replayed batch is waiting for its retry and a
// live batch arrives. The live lookup never selects replay_pending, so the live batch is
// claimed at once.
func TestClaimNextLogBatchClaimsLiveBatchWhileReplayedBatchRetries(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	database := dalmocks.NewDal(t)
	var liveLookup dal.DalClause
	database.EXPECT().All(mock.AnythingOfType("*[]*service.rawBatchHead"), mock.Anything, mock.Anything, mock.Anything).Run(
		func(heads interface{}, clauses ...dal.Clause) {
			liveLookup = clauses[0].Data.(dal.DalClause)
			*heads.(*[]*rawBatchHead) = []*rawBatchHead{{ID: 9, ReceivedAt: now.Add(-time.Second), Status: models.OtelBatchStatusPending}}
		},
	).Return(nil).Once()
	database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(nil).Once()
	database.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Run(func(batch interface{}, _ ...dal.Clause) {
		*batch.(*models.OtelLogBatch) = models.OtelLogBatch{Model: common.Model{ID: 9}, Status: models.OtelBatchStatusProcessing}
	}).Return(nil).Once()
	converter := newRawConverter(database, nil)
	converter.now = func() time.Time { return now }

	batch, lease, err := converter.claimNextLogBatch()
	if err != nil || batch == nil || batch.ID != 9 || lease.replayed() || lease.status != models.OtelBatchStatusProcessing {
		t.Fatalf("claimNextLogBatch() = %#v, %#v, %v; want live batch 9", batch, lease, err)
	}
	for _, param := range liveLookup.Params {
		if param == models.OtelBatchStatusReplayPending {
			t.Fatalf("live claim query params = %v; must not select replay_pending", liveLookup.Params)
		}
	}
}

func TestIsBatchClaimableReplayPending(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	past, future := now.Add(-time.Second), now.Add(time.Second)
	tests := []struct {
		name          string
		leaseUntil    *time.Time
		nextAttemptAt *time.Time
		want          bool
	}{
		{"queued", nil, nil, true},
		{"retry due", nil, &past, true},
		{"retry waiting", nil, &future, false},
		{"leased", &future, nil, false},
		{"lease expired", &past, nil, true},
	}
	for _, test := range tests {
		if got := isBatchClaimable(models.OtelBatchStatusReplayPending, test.leaseUntil, test.nextAttemptAt, now); got != test.want {
			t.Errorf("%s: isBatchClaimable() = %t, want %t", test.name, got, test.want)
		}
	}
}

// A lost lease records no failure, so a batch whose conversion always outlives its lease
// would be reclaimed forever. On its last allowed attempt it is quarantined instead.
func TestClaimNextBatchQuarantinesBatchThatLostItsLeaseOnEveryAttempt(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	expired := now.Add(-time.Second)
	tests := []struct {
		name     string
		status   string
		statuses []string
	}{
		{"live", models.OtelBatchStatusProcessing, nonterminalBatchStatuses},
		{"replayed", models.OtelBatchStatusReplayPending, []string{models.OtelBatchStatusReplayPending}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database := dalmocks.NewDal(t)
			expectClaimHead(database, &rawBatchHead{ID: 6, Status: test.status, AttemptCount: converterMaxAttempts, LeaseUntil: &expired}).Once()
			var columns map[string]interface{}
			var where dal.DalClause
			database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, clauses ...dal.Clause) {
				columns = columnSets(sets)
				where = clauses[0].Data.(dal.DalClause)
			}).Return(nil).Once()
			// No First expectation: the batch must not be claimed.
			converter := newRawConverter(database, nil)
			converter.now = func() time.Time { return now }

			lease, err := converter.claimNextBatch(&models.OtelLogBatch{}, &models.OtelLogBatch{}, test.statuses)
			if err != nil || lease != nil {
				t.Fatalf("claimNextBatch() = %#v, %v; want no claim", lease, err)
			}
			if columns["status"] != models.OtelBatchStatusPermanentError || columns["processing_error_code"] != string(errorRetryExhausted) ||
				where.Params[1] != test.status || where.Params[2] != converterMaxAttempts {
				t.Fatalf("columns = %v where %v; want the batch quarantined as retry_exhausted", columns, where.Params)
			}
			if _, set := columns["processed_at"]; !set {
				t.Fatalf("columns = %v; want processed_at set", columns)
			}
		})
	}
}

// commitInLease must address the row by the status the lease keeps, or a replayed batch,
// which stays replay_pending, could never be marked processed.
func TestCommitInLeaseMatchesReplayedBatchByItsLeasedStatus(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction).Once()
	var verified, marked dal.DalClause
	transaction.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Run(func(_ interface{}, clauses ...dal.Clause) {
		verified = clauses[1].Data.(dal.DalClause)
	}).Return(nil).Once()
	var columns map[string]interface{}
	transaction.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, clauses ...dal.Clause) {
		columns = columnSets(sets)
		marked = clauses[0].Data.(dal.DalClause)
	}).Return(nil).Once()
	transaction.EXPECT().Commit().Return(nil).Once()
	converter := newRawConverter(database, nil)
	converter.now = func() time.Time { return now }
	lease := &batchLease{table: &models.OtelLogBatch{}, id: 2, attempts: 1, owner: "worker", status: models.OtelBatchStatusReplayPending}

	if err := converter.commitInLease(lease, &preparedBatch{}, func(dal.Transaction) error { return nil }); err != nil {
		t.Fatalf("commitInLease() error = %v", err)
	}
	if verified.Params[1] != models.OtelBatchStatusReplayPending || marked.Params[1] != models.OtelBatchStatusReplayPending || columns["status"] != models.OtelBatchStatusProcessed {
		t.Fatalf("lease check %v, update %v -> %v; want both matched on replay_pending and the batch processed", verified.Params, marked.Params, columns)
	}
}

func TestClaimNextLogBatchClaimsEarliestPendingBatch(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	database := dalmocks.NewDal(t)
	expectClaimHead(database, &rawBatchHead{ID: 5, ReceivedAt: now.Add(-time.Minute), Status: models.OtelBatchStatusPending, AttemptCount: 2}).Once()
	var claim map[string]interface{}
	database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
		claim = columnSets(sets)
	}).Return(nil).Once()
	database.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Run(func(batch interface{}, _ ...dal.Clause) {
		*batch.(*models.OtelLogBatch) = models.OtelLogBatch{Model: common.Model{ID: 5}, Status: models.OtelBatchStatusProcessing}
	}).Return(nil).Once()
	converter := newRawConverter(database, nil)
	converter.now = func() time.Time { return now }

	batch, lease, err := converter.claimNextLogBatch()
	if err != nil || batch == nil || batch.ID != 5 || lease == nil || lease.owner == "" || lease.id != 5 || lease.attempts != 3 {
		t.Fatalf("claimNextLogBatch() = %#v, %#v, %v; want batch 5 leased for attempt 3", batch, lease, err)
	}
	if claim["status"] != models.OtelBatchStatusProcessing || claim["attempt_count"] != 3 || claim["lease_owner"] != lease.owner {
		t.Fatalf("claim columns = %v, want processing, attempt 3 and lease owner %q", claim, lease.owner)
	}
}

// newSkippedRecordsLogBatch stores the fixture with every user identity removed, so each
// record is skipped and the batch converts to no events.
func newSkippedRecordsLogBatch(t *testing.T) *models.OtelLogBatch {
	t.Helper()
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	for _, resourceLogs := range request.GetResourceLogs() {
		for _, record := range resourceLogRecords(resourceLogs) {
			kept := record.GetAttributes()[:0]
			for _, attribute := range record.GetAttributes() {
				if !strings.HasPrefix(attribute.GetKey(), "user.") {
					kept = append(kept, attribute)
				}
			}
			record.Attributes = kept
		}
	}
	payload, err := proto.Marshal(request)
	if err != nil {
		t.Fatalf("proto.Marshal() error = %v", err)
	}
	return &models.OtelLogBatch{Model: common.Model{ID: 8}, PayloadProto: payload, PayloadSchemaVersion: otelPayloadSchemaVersion}
}

func TestConvertLogBatchMarksProcessedWithRecordSkips(t *testing.T) {
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})
	tx := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(tx).Once()
	tx.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	var columns map[string]interface{}
	tx.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
		columns = columnSets(sets)
	}).Return(nil).Once()
	tx.EXPECT().Commit().Return(nil).Once()

	prepared, err := newRawConverter(database, nil).convertLogBatch(newSkippedRecordsLogBatch(t), &batchLease{table: &models.OtelLogBatch{}, id: 8, attempts: 1, owner: "worker"})
	if err != nil {
		t.Fatalf("convertLogBatch() error = %v", err)
	}
	if len(prepared.events) != 0 || prepared.skipped[skippedLogRecord] != 13 {
		t.Fatalf("convertLogBatch() events=%d skipped records=%d, want 0 and 13", len(prepared.events), prepared.skipped[skippedLogRecord])
	}
	code, _ := columns["processing_error_code"].(*string)
	message, _ := columns["processing_error_message"].(*string)
	if columns["status"] != models.OtelBatchStatusProcessed || code == nil || *code != string(diagnosticRecordsSkipped) ||
		message == nil || !strings.Contains(*message, "13 log record(s)") {
		t.Fatalf("processed columns = %v (code %v, message %v)", columns, code, message)
	}
}

func TestConvertLogBatchReportsLostLease(t *testing.T) {
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})
	tx := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(tx).Once()
	tx.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(errors.NotFound.New("lease taken")).Once()
	tx.EXPECT().Rollback().Return(nil).Once()

	_, err := newRawConverter(database, nil).convertLogBatch(newSkippedRecordsLogBatch(t), &batchLease{table: &models.OtelLogBatch{}, id: 8, attempts: 1, owner: "worker"})
	if code, _, _ := classifyConversionError(err); code != errorLeaseLost {
		t.Fatalf("convertLogBatch() error = %v, want %s", err, errorLeaseLost)
	}
}

// writePromptRollup replaces a prompt's failure rows: it clears the stored ones before
// writing the rebuilt ones, so a replay neither duplicates rows nor keeps rows for failures
// that no longer exist. A storage error stops the write and names the step that failed.
func TestWritePromptRollupReplacesFailures(t *testing.T) {
	prompt := &ai.AiPrompt{DomainEntity: domainlayer.DomainEntity{Id: "prompt-p1"}, WorkspaceKey: testOrganizationID, PromptId: "p1"}
	failure := func(id string) *ai.AiPromptFailure {
		return &ai.AiPromptFailure{DomainEntity: domainlayer.DomainEntity{Id: id}, WorkspaceKey: testOrganizationID, PromptId: "p1"}
	}
	for _, test := range []struct {
		name      string
		failures  []*ai.AiPromptFailure
		clearErr  errors.Error
		writeErr  errors.Error
		wantCalls []string
		wantErr   string
	}{
		{name: "writes failures after clearing", failures: []*ai.AiPromptFailure{failure("f1"), failure("f2")}, wantCalls: []string{"clear", "f1", "f2"}},
		{name: "no failures clears stale rows", wantCalls: []string{"clear"}},
		{name: "clear error", failures: []*ai.AiPromptFailure{failure("f1")}, clearErr: errors.Default.New("db down"), wantCalls: []string{"clear"}, wantErr: "clear Claude Code prompt failures"},
		{name: "write error", failures: []*ai.AiPromptFailure{failure("f1")}, writeErr: errors.Default.New("db down"), wantCalls: []string{"clear", "f1"}, wantErr: "write Claude Code prompt failure"},
	} {
		t.Run(test.name, func(t *testing.T) {
			tx := dalmocks.NewTransaction(t)
			calls := make([]string, 0)
			tx.EXPECT().CreateOrUpdate(mock.AnythingOfType("*ai.AiPrompt")).Return(nil).Once()
			tx.EXPECT().Delete(mock.AnythingOfType("*ai.AiPromptSkill"), mock.Anything).Return(nil).Once()
			tx.EXPECT().Delete(mock.AnythingOfType("*ai.AiPromptFailure"), mock.Anything).Run(func(_ interface{}, clauses ...dal.Clause) {
				if params := whereParams(clauses, 0); !reflect.DeepEqual(params, []interface{}{testOrganizationID, "p1"}) {
					t.Errorf("failure clear params = %v, want the prompt's workspace and id", params)
				}
				calls = append(calls, "clear")
			}).Return(test.clearErr).Once()
			if test.clearErr == nil {
				for range test.failures {
					tx.EXPECT().CreateOrUpdate(mock.AnythingOfType("*ai.AiPromptFailure")).Run(func(entity interface{}, _ ...dal.Clause) {
						calls = append(calls, entity.(*ai.AiPromptFailure).Id)
					}).Return(test.writeErr).Once()
				}
			}

			err := writePromptRollup(tx, promptRollup{prompt: prompt, failures: test.failures})
			if test.wantErr == "" && err != nil {
				t.Fatalf("writePromptRollup() error = %v", err)
			}
			if test.wantErr != "" && (err == nil || !strings.Contains(err.Error(), test.wantErr)) {
				t.Fatalf("writePromptRollup() error = %v, want %q", err, test.wantErr)
			}
			if !reflect.DeepEqual(calls, test.wantCalls) {
				t.Fatalf("failure calls = %v, want %v", calls, test.wantCalls)
			}
		})
	}
}
