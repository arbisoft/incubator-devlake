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
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
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

// A mode change in a later batch reveals the mode of prompts an earlier batch stored, so
// their stored mode must be re-derived even though this batch did not touch them.
func TestRollupSessionRederivesEarlierPromptModesOnLaterModeChange(t *testing.T) {
	at := func(minute int) time.Time { return time.Date(2026, 10, 14, 10, minute, 0, 0, time.UTC) }
	tx := dalmocks.NewTransaction(t)
	tx.EXPECT().All(mock.Anything, mock.Anything, mock.Anything).Run(func(result interface{}, clauses ...dal.Clause) {
		where := whereExpr(clauses, 1)
		switch {
		case strings.Contains(where, "command_name = ?"):
			*result.(*[]*models.OtelEvent) = []*models.OtelEvent{
				otelEventWith(eventPermissionModeChanged, "", at(5), 50, map[string]string{"from_mode": "plan", "to_mode": "acceptEdits"}),
			}
		case strings.Contains(where, "event_name = ?"):
			*result.(*[]*models.OtelEvent) = []*models.OtelEvent{
				otelEventWith(eventUserPrompt, "p1", at(1), 10, nil),
				otelEventWith(eventUserPrompt, "p2", at(6), 60, nil),
				otelEventWith(eventUserPrompt, "p3", at(7), 70, nil),
			}
		case strings.Contains(where, "source_connection_id = ?"):
			*result.(*[]*ai.AiPrompt) = []*ai.AiPrompt{
				{DomainEntity: domainlayer.DomainEntity{Id: "prompt-1"}, PromptId: "p1", StartedAt: at(1), PermissionMode: ai.PermissionModeDefault, PermissionModeInferred: true},
				{DomainEntity: domainlayer.DomainEntity{Id: "prompt-2"}, PromptId: "p2", StartedAt: at(6), PermissionMode: ai.PermissionModeDefault, PermissionModeInferred: true},
				{DomainEntity: domainlayer.DomainEntity{Id: "prompt-3"}, PromptId: "p3", StartedAt: at(7), PermissionMode: "acceptEdits"},
			}
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
	want := map[string]map[string]interface{}{
		// Before the change, the prompt ran in its from_mode.
		"prompt-1": {"permission_mode": "plan", "permission_mode_inferred": false},
		"prompt-2": {"permission_mode": "acceptEdits", "permission_mode_inferred": false},
	}
	if len(updated) != len(want) {
		t.Fatalf("updated prompts = %v, want %v", updated, want)
	}
	for id, columns := range want {
		for column, value := range columns {
			if updated[id][column] != value {
				t.Fatalf("%s %s = %v, want %v", id, column, updated[id][column], value)
			}
		}
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

	target := &sessionTarget{connectionID: 1, userKey: "uuid:u1", promptIDs: map[string]struct{}{"p1": {}}}
	if err := rollupSession(tx, testOrganizationID, target); err != nil {
		t.Fatalf("rollupSession() error = %v", err)
	}
	if written == nil || written.PermissionMode != ai.PermissionModeDefault || !written.PermissionModeInferred {
		t.Fatalf("written prompt = %#v, want inferred default mode", written)
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

func TestDomainAccountIDCachesLookupsPerEmail(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	notFound := errors.NotFound.New("no account")
	tx.EXPECT().First(mock.AnythingOfType("*crossdomain.Account"), mock.Anything, mock.Anything).Return(notFound).Once()
	tx.EXPECT().IsErrorNotFound(notFound).Return(true).Once()
	cache := make(map[string]string)

	for attempt := 0; attempt < 2; attempt++ {
		accountID, err := domainAccountID(tx, cache, "dev@example.com")
		if err != nil || accountID != "" {
			t.Fatalf("domainAccountID() = %q, %v; want no account", accountID, err)
		}
	}
	if accountID, err := domainAccountID(tx, cache, ""); err != nil || accountID != "" {
		t.Fatalf("domainAccountID(\"\") = %q, %v", accountID, err)
	}
}

func TestDomainAccountIDReturnsLookupErrors(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	failure := errors.Default.New("database unavailable")
	tx.EXPECT().First(mock.AnythingOfType("*crossdomain.Account"), mock.Anything, mock.Anything).Return(failure).Once()
	tx.EXPECT().IsErrorNotFound(failure).Return(false).Once()

	if _, err := domainAccountID(tx, make(map[string]string), "dev@example.com"); err == nil {
		t.Fatal("domainAccountID() error = nil, want the lookup error")
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
		{"retryable", 1, &conversionError{code: errorStorageFailure, err: fmt.Errorf("deadlock")}, errorStorageFailure, models.OtelMetricBatchStatusRetryableError, false},
		{"permanent", 1, permanentMetricError(errorInvalidPayload, "bad payload"), errorInvalidPayload, models.OtelMetricBatchStatusPermanentError, true},
		{"retries exhausted", converterMaxAttempts, &conversionError{code: errorStorageFailure, err: fmt.Errorf("deadlock")}, errorRetryExhausted, models.OtelMetricBatchStatusPermanentError, true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database := dalmocks.NewDal(t)
			var columns map[string]interface{}
			database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
				columns = columnSets(sets)
			}).Return(nil).Once()
			converter := newRawMetricConverter(database, nil)
			converter.now = func() time.Time { return now }

			batch := &models.OtelLogBatch{Model: common.Model{ID: 3}, AttemptCount: test.attempts}
			if err := converter.recordLogBatchFailure(batch, "worker", test.err); err != nil {
				t.Fatalf("recordLogBatchFailure() error = %v", err)
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
	converter := newRawMetricConverter(dalmocks.NewDal(t), nil)
	batch := &models.OtelLogBatch{Model: common.Model{ID: 3}, AttemptCount: 1}
	if err := converter.recordLogBatchFailure(batch, "worker", &conversionError{code: errorLeaseLost, err: fmt.Errorf("lease taken")}); err != nil {
		t.Fatalf("recordLogBatchFailure() error = %v", err)
	}
}

func TestClaimNextLogBatchWaitsBehindRetryDelayedHead(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	nextAttemptAt := now.Add(time.Minute)
	database := dalmocks.NewDal(t)
	database.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Run(func(batch interface{}, _ ...dal.Clause) {
		*batch.(*models.OtelLogBatch) = models.OtelLogBatch{Model: common.Model{ID: 4}, ReceivedAt: now.Add(-time.Hour), Status: models.OtelMetricBatchStatusRetryableError, NextAttemptAt: &nextAttemptAt}
	}).Return(nil)
	converter := newRawMetricConverter(database, nil)
	converter.now = func() time.Time { return now }

	batch, _, err := converter.claimNextLogBatch()
	if err != nil || batch != nil {
		t.Fatalf("claimNextLogBatch() = %#v, %v; want no claim while the head waits for retry", batch, err)
	}
}

func TestClaimNextLogBatchClaimsEarliestPendingBatch(t *testing.T) {
	now := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	notFound := errors.NotFound.New("no batch")
	database := dalmocks.NewDal(t)
	database.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).RunAndReturn(func(batch interface{}, clauses ...dal.Clause) errors.Error {
		if whereParams(clauses, 1)[0] != models.OtelMetricBatchStatusPending {
			return notFound
		}
		*batch.(*models.OtelLogBatch) = models.OtelLogBatch{Model: common.Model{ID: 5}, ReceivedAt: now.Add(-time.Minute), Status: models.OtelMetricBatchStatusPending, AttemptCount: 2}
		return nil
	}).Times(len(nonterminalBatchStatuses))
	database.EXPECT().IsErrorNotFound(notFound).Return(true)
	var claim map[string]interface{}
	database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
		claim = columnSets(sets)
	}).Return(nil).Once()
	database.EXPECT().First(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Run(func(batch interface{}, _ ...dal.Clause) {
		*batch.(*models.OtelLogBatch) = models.OtelLogBatch{Model: common.Model{ID: 5}, Status: models.OtelMetricBatchStatusProcessing}
	}).Return(nil).Once()
	converter := newRawMetricConverter(database, nil)
	converter.now = func() time.Time { return now }

	batch, leaseOwner, err := converter.claimNextLogBatch()
	if err != nil || batch == nil || batch.ID != 5 || leaseOwner == "" {
		t.Fatalf("claimNextLogBatch() = %#v, %q, %v; want batch 5 with a lease owner", batch, leaseOwner, err)
	}
	if claim["status"] != models.OtelMetricBatchStatusProcessing || claim["attempt_count"] != 3 || claim["lease_owner"] != leaseOwner {
		t.Fatalf("claim columns = %v, want processing, attempt 3 and lease owner %q", claim, leaseOwner)
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

	prepared, err := newRawMetricConverter(database, nil).convertLogBatch(newSkippedRecordsLogBatch(t), "worker")
	if err != nil {
		t.Fatalf("convertLogBatch() error = %v", err)
	}
	if len(prepared.events) != 0 || prepared.skippedRecordCount != 13 {
		t.Fatalf("convertLogBatch() events=%d skipped records=%d, want 0 and 13", len(prepared.events), prepared.skippedRecordCount)
	}
	code, _ := columns["processing_error_code"].(*string)
	message, _ := columns["processing_error_message"].(*string)
	if columns["status"] != models.OtelMetricBatchStatusProcessed || code == nil || *code != string(diagnosticRecordsSkipped) ||
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

	_, err := newRawMetricConverter(database, nil).convertLogBatch(newSkippedRecordsLogBatch(t), "worker")
	if code, _, _ := classifyConversionError(err); code != errorLeaseLost {
		t.Fatalf("convertLogBatch() error = %v, want %s", err, errorLeaseLost)
	}
}
