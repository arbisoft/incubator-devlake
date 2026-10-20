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
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	devlakeerrors "github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/common"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
)

var replayTestNow = time.Date(2026, 10, 19, 10, 30, 0, 0, time.UTC)

func replayTestToday() time.Time {
	return replayTestNow.Truncate(24 * time.Hour)
}

func replayTestDay(daysFromToday int) string {
	return replayTestToday().AddDate(0, 0, daysFromToday).Format(replayDateLayout)
}

func replayTestRange(startOffset, endOffset int) OtelReplayRange {
	return OtelReplayRange{StartDate: replayTestDay(startOffset), EndDate: replayTestDay(endOffset)}
}

func useReplayTestDal(t *testing.T, database dal.Dal) {
	t.Helper()
	previous := db
	db = database
	t.Cleanup(func() { db = previous })
}

func requireHttpCode(t *testing.T, err devlakeerrors.Error, want int) {
	t.Helper()
	if err == nil || err.GetType().GetHttpCode() != want {
		t.Fatalf("error = %v, want HTTP %d", err, want)
	}
}

func TestPlanReplayRangesChunksOldestFirst(t *testing.T) {
	cases := []struct {
		name       string
		startDays  int
		wantChunks []int
	}{
		{"one day", 0, []int{1}},
		{"31 days", -30, []int{31}},
		{"32 days", -31, []int{31, 1}},
		{"90 days", -89, []int{31, 31, 28}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			chunks, err := planReplayRanges(replayTestRange(tc.startDays, 0), nil, replayTestNow)
			if err != nil || len(chunks) != len(tc.wantChunks) {
				t.Fatalf("planReplayRanges() = %v, %v; want %d chunks", chunks, err, len(tc.wantChunks))
			}
			cursor := replayTestToday().AddDate(0, 0, tc.startDays)
			for index, chunk := range chunks {
				if !chunk.start.Equal(cursor) || chunk.end.Sub(chunk.start) != time.Duration(tc.wantChunks[index])*24*time.Hour {
					t.Fatalf("chunk %d = %s..%s, want %d days from %s", index, chunk.start, chunk.end, tc.wantChunks[index], cursor)
				}
				cursor = chunk.end
				if wantAfterToday := index == len(chunks)-1; chunk.end.After(replayTestToday()) != wantAfterToday {
					t.Fatalf("chunk %d end %s after today midnight = %t, want %t", index, chunk.end, !wantAfterToday, wantAfterToday)
				}
			}
		})
	}
}

func TestPlanReplayRangesEnforcesRetentionAndToday(t *testing.T) {
	if _, err := planReplayRanges(replayTestRange(-89, 0), nil, replayTestNow); err != nil {
		t.Fatalf("earliest retained day rejected: %v", err)
	}
	for name, dates := range map[string]OtelReplayRange{
		"before retention": replayTestRange(-90, 0),
		"after today":      replayTestRange(0, 1),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := planReplayRanges(dates, nil, replayTestNow)
			requireHttpCode(t, err, http.StatusBadRequest)
			if err.GetData() != OtelErrorReplayRange {
				t.Fatalf("error code = %v, want %s", err.GetData(), OtelErrorReplayRange)
			}
			if !strings.Contains(err.Error(), replayTestDay(-89)) || !strings.Contains(err.Error(), replayTestDay(0)) {
				t.Fatalf("error %q does not name both bounds", err.Error())
			}
		})
	}
}

func TestPlanReplayRangesRespectsConnectionCreation(t *testing.T) {
	createdAt := replayTestToday().AddDate(0, 0, -10).Add(15 * time.Hour)
	dates := replayTestRange(-11, 0)
	_, err := planReplayRanges(dates, &createdAt, replayTestNow)
	requireHttpCode(t, err, http.StatusBadRequest)
	if !strings.Contains(err.Error(), replayTestDay(-10)) {
		t.Fatalf("error %q does not name the creation day", err.Error())
	}
	if _, err := planReplayRanges(dates, nil, replayTestNow); err != nil {
		t.Fatalf("same input without a creation time rejected: %v", err)
	}
	if _, err := planReplayRanges(replayTestRange(-10, 0), &createdAt, replayTestNow); err != nil {
		t.Fatalf("creation day rejected: %v", err)
	}
}

func TestPlanReplayRangesRejectsBadInput(t *testing.T) {
	_, err := planReplayRanges(OtelReplayRange{StartDate: "19/10/2026", EndDate: replayTestDay(0)}, nil, replayTestNow)
	requireHttpCode(t, err, http.StatusBadRequest)
	_, err = planReplayRanges(replayTestRange(-1, -2), nil, replayTestNow)
	requireHttpCode(t, err, http.StatusBadRequest)
	if !strings.Contains(err.Error(), "on or before") {
		t.Fatalf("error %q does not explain the order", err.Error())
	}
}

func replayTestChunks() []replayChunk {
	start := replayTestToday().AddDate(0, 0, -3)
	return []replayChunk{{start: start, end: start.AddDate(0, 0, 2)}}
}

func TestQueueReplaysReusesPerKind(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	var lookups []dal.DalClause
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		lookups = append(lookups, whereOf(clauseArgs(args, 1)))
		if len(lookups) == 1 {
			*args.Get(0).(*models.OtelReplayRequest) = models.OtelReplayRequest{Model: common.Model{ID: 9}, Kind: models.OtelReplayKindMetrics, Status: models.OtelReplayRequestStatusPending}
		}
	}).Return(nil).Once()
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		lookups = append(lookups, whereOf(clauseArgs(args, 1)))
	}).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("IsErrorNotFound", mock.Anything).Return(true).Once()
	var created *models.OtelReplayRequest
	tx.On("Create", mock.AnythingOfType("*models.OtelReplayRequest")).Run(func(args mock.Arguments) {
		created = args.Get(0).(*models.OtelReplayRequest)
		created.ID = 10
	}).Return(nil).Once()
	tx.On("Create", mock.AnythingOfType("*models.OtelAuditEvent")).Return(nil).Once()

	queue, err := queueReplays(tx, nil, nil, replayTestChunks(), replayTestNow)
	if err != nil || len(queue.Reused) != 1 || queue.Reused[0].Id != 9 || len(queue.Queued) != 1 || queue.Queued[0].Id != 10 {
		t.Fatalf("queueReplays() = %+v, %v; want metrics 9 reused and logs 10 queued", queue, err)
	}
	if created.Kind != models.OtelReplayKindLogs || queue.Queued[0].Kind != models.OtelReplayKindLogs {
		t.Fatalf("created kind = %q, view kind = %q; want logs", created.Kind, queue.Queued[0].Kind)
	}
	tx.AssertNumberOfCalls(t, "Create", 2)
	if len(lookups) != 2 {
		t.Fatalf("lookups = %d, want one per kind", len(lookups))
	}
	for index, kind := range []string{models.OtelReplayKindMetrics, models.OtelReplayKindLogs} {
		if params := lookups[index].Params; !strings.HasSuffix(lookups[index].Expr, "AND kind = ?") || params[len(params)-1] != kind {
			t.Fatalf("lookup %d = %q %v; want it limited to %s requests", index, lookups[index].Expr, params, kind)
		}
	}
}

func TestQueueReplaysDoesNotReuseAWaitingMetricsRequestForPastDays(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	lookups := map[string][]dal.Clause{}
	record := func(args mock.Arguments) {
		clauses := clauseArgs(args, 1)
		params := whereOf(clauses).Params
		lookups[params[len(params)-1].(string)] = clauses
	}
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything, mock.Anything).Run(record).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Run(record).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("IsErrorNotFound", mock.Anything).Return(true).Twice()
	tx.On("Create", mock.Anything).Return(nil).Times(3)

	if _, err := queueReplays(tx, nil, nil, replayTestChunks(), replayTestNow); err != nil {
		t.Fatalf("queueReplays() error = %v", err)
	}
	metrics := lookups[models.OtelReplayKindMetrics]
	if len(metrics) != 3 || metrics[2].Type != dal.WhereClause {
		t.Fatalf("metrics lookup = %#v; want a third where clause", metrics)
	}
	bound := metrics[2].Data.(dal.DalClause)
	if bound.Expr != "range_end <= ?" || !bound.Params[0].(time.Time).Equal(replayTestToday()) {
		t.Fatalf("metrics bound = %q %v; want range_end <= today", bound.Expr, bound.Params)
	}
	if len(lookups[models.OtelReplayKindLogs]) != 2 {
		t.Fatalf("logs lookup = %#v; want no range bound", lookups[models.OtelReplayKindLogs])
	}
}

func TestQueueReplaysKeepsThePlainLookupForAChunkIncludingToday(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	chunks := []replayChunk{{start: replayTestToday().AddDate(0, 0, -1), end: replayTestToday().AddDate(0, 0, 1)}}
	var counts []int
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		counts = append(counts, len(clauseArgs(args, 1)))
	}).Return(devlakeerrors.NotFound.New("none")).Twice()
	tx.On("IsErrorNotFound", mock.Anything).Return(true).Twice()
	tx.On("Create", mock.Anything).Return(nil).Times(3)

	if _, err := queueReplays(tx, nil, nil, chunks, replayTestNow); err != nil {
		t.Fatalf("queueReplays() error = %v", err)
	}
	if len(counts) != 2 || counts[0] != 2 || counts[1] != 2 {
		t.Fatalf("lookup clause counts = %v; want the plain lookup for both kinds", counts)
	}
}

func TestQueueReplaysInsertsWhenNoPendingCovers(t *testing.T) {
	connection := &models.OtelConnection{Model: common.Model{ID: 4}, TeamName: "Platform"}
	user := &common.User{Name: "Ada", Email: "ada@example.com"}
	tx := dalmocks.NewTransaction(t)
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything, mock.Anything).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("IsErrorNotFound", mock.Anything).Return(true).Twice()
	var createdAll []*models.OtelReplayRequest
	tx.On("Create", mock.AnythingOfType("*models.OtelReplayRequest")).Run(func(args mock.Arguments) {
		request := args.Get(0).(*models.OtelReplayRequest)
		request.ID = uint64(12 + len(createdAll))
		createdAll = append(createdAll, request)
	}).Return(nil).Twice()
	var audit *models.OtelAuditEvent
	tx.On("Create", mock.AnythingOfType("*models.OtelAuditEvent")).Run(func(args mock.Arguments) {
		audit = args.Get(0).(*models.OtelAuditEvent)
	}).Return(nil).Once()

	chunks := replayTestChunks()
	queue, err := queueReplays(tx, user, connection, chunks, replayTestNow)
	if err != nil || len(queue.Queued) != 2 || len(queue.Reused) != 0 || queue.Queued[0].Id != 12 || queue.Queued[1].Id != 13 {
		t.Fatalf("queueReplays() = %+v, %v; want requests 12 and 13 queued", queue, err)
	}
	created := createdAll[0]
	if createdAll[0].Kind != models.OtelReplayKindMetrics || createdAll[1].Kind != models.OtelReplayKindLogs ||
		queue.Queued[0].Kind != models.OtelReplayKindMetrics || queue.Queued[1].Kind != models.OtelReplayKindLogs {
		t.Fatalf("created kinds = %q, %q; want metrics then logs", createdAll[0].Kind, createdAll[1].Kind)
	}
	if created.Status != models.OtelReplayRequestStatusPending || created.RequestedBy == nil || *created.RequestedBy != "ada@example.com" ||
		created.RequestedForConnectionId == nil || *created.RequestedForConnectionId != 4 ||
		!created.RangeStart.Equal(chunks[0].start) || !created.RangeEnd.Equal(chunks[0].end) {
		t.Fatalf("created request = %+v", created)
	}
	if createdAll[1].RequestedForConnectionId == nil || *createdAll[1].RequestedForConnectionId != 4 || !createdAll[1].RangeStart.Equal(chunks[0].start) || !createdAll[1].RangeEnd.Equal(chunks[0].end) {
		t.Fatalf("created logs request = %+v", createdAll[1])
	}
	if audit.Action != models.OtelAuditActionReplayRequested || audit.ConnectionId == nil || *audit.ConnectionId != 4 ||
		audit.ActorEmail == nil || *audit.ActorEmail != "ada@example.com" || audit.Detail == nil || !strings.Contains(*audit.Detail, `"queued":[12,13]`) {
		t.Fatalf("audit event = %+v", audit)
	}
	tx.AssertNumberOfCalls(t, "Create", 3)
}

func TestQueueReplaysStoresNullRequesterWithoutUser(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything, mock.Anything).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("IsErrorNotFound", mock.Anything).Return(true).Twice()
	var created *models.OtelReplayRequest
	tx.On("Create", mock.AnythingOfType("*models.OtelReplayRequest")).Run(func(args mock.Arguments) {
		created = args.Get(0).(*models.OtelReplayRequest)
	}).Return(nil).Twice()
	var audit *models.OtelAuditEvent
	tx.On("Create", mock.AnythingOfType("*models.OtelAuditEvent")).Run(func(args mock.Arguments) {
		audit = args.Get(0).(*models.OtelAuditEvent)
	}).Return(nil).Once()

	if _, err := queueReplays(tx, nil, nil, replayTestChunks(), replayTestNow); err != nil {
		t.Fatalf("queueReplays() error = %v", err)
	}
	if created.RequestedBy != nil || created.RequestedForConnectionId != nil || audit.ActorName != nil || audit.ActorEmail != nil {
		t.Fatalf("request = %+v, audit = %+v; want null actors", created, audit)
	}
}

func TestReplayStateMapsWaitingAndExpiredLease(t *testing.T) {
	live := replayTestNow.Add(time.Minute)
	expired := replayTestNow.Add(-time.Minute)
	past := replayTestToday()
	future := replayTestToday().AddDate(0, 0, 1)
	cases := []struct {
		name    string
		request models.OtelReplayRequest
		want    OtelReplayState
	}{
		{"pending future end", models.OtelReplayRequest{Status: models.OtelReplayRequestStatusPending, RangeEnd: future}, OtelReplayStateWaiting},
		{"pending past end", models.OtelReplayRequest{Status: models.OtelReplayRequestStatusPending, RangeEnd: past}, OtelReplayStatePending},
		{"processing expired lease", models.OtelReplayRequest{Status: models.OtelReplayRequestStatusProcessing, LeaseUntil: &expired, RangeEnd: past}, OtelReplayStatePending},
		{"processing no lease", models.OtelReplayRequest{Status: models.OtelReplayRequestStatusProcessing, RangeEnd: past}, OtelReplayStatePending},
		{"processing expired lease future end", models.OtelReplayRequest{Status: models.OtelReplayRequestStatusProcessing, LeaseUntil: &expired, RangeEnd: future}, OtelReplayStateWaiting},
		{"processing live lease", models.OtelReplayRequest{Status: models.OtelReplayRequestStatusProcessing, LeaseUntil: &live, RangeEnd: past}, OtelReplayStateProcessing},
		{"pending metrics future end", models.OtelReplayRequest{Kind: models.OtelReplayKindMetrics, Status: models.OtelReplayRequestStatusPending, RangeEnd: future}, OtelReplayStateWaiting},
		{"pending logs future end", models.OtelReplayRequest{Kind: models.OtelReplayKindLogs, Status: models.OtelReplayRequestStatusPending, RangeEnd: future}, OtelReplayStatePending},
		{"completed", models.OtelReplayRequest{Status: models.OtelReplayRequestStatusCompleted, RangeEnd: future}, OtelReplayStateCompleted},
		{"failed", models.OtelReplayRequest{Status: models.OtelReplayRequestStatusFailed, RangeEnd: future}, OtelReplayStateFailed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := replayState(&tc.request, replayTestNow); got != tc.want {
				t.Fatalf("replayState() = %q, want %q", got, tc.want)
			}
		})
	}
}

const (
	rebindOldOrganization = "0d0e7a3b-52f1-4c7e-9a51-3f6f2f7c1b9e"
	rebindNewOrganization = "7c1f3a52-9d84-4b0e-a1c6-2e5d8b9f4a30"
)

// newRebindTestDal returns a Dal whose Begin hands out tx and which answers the response lookups.
func newRebindTestDal(t *testing.T, tx *dalmocks.Transaction) *dalmocks.Dal {
	t.Helper()
	database := dalmocks.NewDal(t)
	database.EXPECT().Begin().Return(tx).Maybe()
	database.On("All", mock.AnythingOfType("*[]*models.OtelCredential"), mock.Anything, mock.Anything).Return(nil).Maybe()
	database.On("All", mock.AnythingOfType("*[]*models.OtelConnectionProject"), mock.Anything, mock.Anything).Return(nil).Maybe()
	useReplayTestDal(t, database)
	return database
}

func TestRebindOtelOrganizationRejectsInvalidUUIDBeforeAnyDbCall(t *testing.T) {
	useReplayTestDal(t, dalmocks.NewDal(t))
	_, err := RebindOtelOrganization(nil, 4, &OtelRebindInput{OrganizationId: "not-a-uuid"})
	requireHttpCode(t, err, http.StatusBadRequest)
}

func TestRebindOtelOrganizationRejectsHiddenConnection(t *testing.T) {
	hiddenAt := replayTestNow
	tx := dalmocks.NewTransaction(t)
	expectOtelConnectionLock(t, tx, models.OtelConnection{Model: common.Model{ID: 4}, HiddenAt: &hiddenAt})
	tx.EXPECT().Rollback().Return(nil)
	newRebindTestDal(t, tx)

	_, err := RebindOtelOrganization(nil, 4, &OtelRebindInput{OrganizationId: rebindNewOrganization})
	requireHttpCode(t, err, http.StatusNotFound)
}

func TestRebindOtelOrganizationRejectsSameOrganizationInAnyCase(t *testing.T) {
	stored := rebindOldOrganization
	tx := dalmocks.NewTransaction(t)
	expectOtelConnectionLock(t, tx, models.OtelConnection{Model: common.Model{ID: 4}, OrganizationId: &stored})
	tx.EXPECT().Rollback().Return(nil)
	newRebindTestDal(t, tx)

	_, err := RebindOtelOrganization(nil, 4, &OtelRebindInput{OrganizationId: " " + strings.ToUpper(rebindOldOrganization) + " "})
	requireHttpCode(t, err, http.StatusBadRequest)
	if err.GetData() != OtelErrorAlreadyBound {
		t.Fatalf("error code = %v, want %s", err.GetData(), OtelErrorAlreadyBound)
	}
}

func expectRebindWrites(tx *dalmocks.Transaction, updated **models.OtelConnection, audit **models.OtelAuditEvent) {
	tx.On("Update", mock.AnythingOfType("*models.OtelConnection")).Run(func(args mock.Arguments) {
		*updated = args.Get(0).(*models.OtelConnection)
	}).Return(nil).Once()
	tx.On("Create", mock.AnythingOfType("*models.OtelAuditEvent")).Run(func(args mock.Arguments) {
		if *audit == nil {
			*audit = args.Get(0).(*models.OtelAuditEvent)
		}
	}).Return(nil)
}

func TestRebindOtelOrganizationAllowsRevokedConnection(t *testing.T) {
	stored := rebindOldOrganization
	tx := dalmocks.NewTransaction(t)
	expectOtelConnectionLock(t, tx, models.OtelConnection{Model: common.Model{ID: 4}, Status: models.OtelConnectionStatusRevoked, OrganizationId: &stored})
	var updated *models.OtelConnection
	var audit *models.OtelAuditEvent
	expectRebindWrites(tx, &updated, &audit)
	tx.EXPECT().Commit().Return(nil)
	newRebindTestDal(t, tx)

	result, err := RebindOtelOrganization(nil, 4, &OtelRebindInput{OrganizationId: rebindNewOrganization})
	if err != nil || result.Connection.Connection.ID != 4 || result.Replays != nil {
		t.Fatalf("RebindOtelOrganization() = %+v, %v", result, err)
	}
	if audit == nil || audit.Action != models.OtelAuditActionOrganizationRebind {
		t.Fatalf("audit event = %+v, want a rebind", audit)
	}
}

func TestRebindOtelOrganizationWritesOrganizationActorAndAudit(t *testing.T) {
	stored := rebindOldOrganization
	user := &common.User{Name: "Ada", Email: "ada@example.com"}
	tx := dalmocks.NewTransaction(t)
	expectOtelConnectionLock(t, tx, models.OtelConnection{Model: common.Model{ID: 4}, Status: models.OtelConnectionStatusActive, OrganizationId: &stored})
	var updated *models.OtelConnection
	var audit *models.OtelAuditEvent
	expectRebindWrites(tx, &updated, &audit)
	tx.EXPECT().Commit().Return(nil)
	newRebindTestDal(t, tx)

	if _, err := RebindOtelOrganization(user, 4, &OtelRebindInput{OrganizationId: strings.ToUpper(rebindNewOrganization)}); err != nil {
		t.Fatalf("RebindOtelOrganization() error = %v", err)
	}
	if updated.OrganizationId == nil || *updated.OrganizationId != rebindNewOrganization || updated.UpdatedBy != "Ada" || updated.UpdatedByEmail != "ada@example.com" {
		t.Fatalf("updated connection = %+v", updated)
	}
	if audit.OldValue == nil || *audit.OldValue != rebindOldOrganization || audit.NewValue == nil || *audit.NewValue != rebindNewOrganization ||
		audit.ConnectionId == nil || *audit.ConnectionId != 4 || audit.ActorEmail == nil || *audit.ActorEmail != "ada@example.com" {
		t.Fatalf("audit event = %+v", audit)
	}
}

func TestRebindOtelOrganizationQueuesReplayInSameTransaction(t *testing.T) {
	createdAt := replayTestToday().AddDate(0, 0, -30)
	tx := dalmocks.NewTransaction(t)
	expectOtelConnectionLock(t, tx, models.OtelConnection{Model: common.Model{ID: 4, CreatedAt: createdAt}, TeamName: "Platform"})
	var updated *models.OtelConnection
	var audit *models.OtelAuditEvent
	expectRebindWrites(tx, &updated, &audit)
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything, mock.Anything).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Return(devlakeerrors.NotFound.New("none")).Once()
	tx.On("IsErrorNotFound", mock.Anything).Return(true).Twice()
	var queuedAll []*models.OtelReplayRequest
	tx.On("Create", mock.AnythingOfType("*models.OtelReplayRequest")).Run(func(args mock.Arguments) {
		request := args.Get(0).(*models.OtelReplayRequest)
		request.ID = uint64(21 + len(queuedAll))
		queuedAll = append(queuedAll, request)
	}).Return(nil).Twice()
	tx.EXPECT().Commit().Return(nil)
	newRebindTestDal(t, tx)

	result, err := RebindOtelOrganization(nil, 4, &OtelRebindInput{OrganizationId: rebindNewOrganization, Replay: &OtelReplayRange{StartDate: replayTestDay(-3), EndDate: replayTestDay(-2)}})
	if err != nil || result.Replays == nil || len(result.Replays.Queued) != 2 || result.Replays.Queued[0].Id != 21 || result.Replays.Queued[1].Id != 22 {
		t.Fatalf("RebindOtelOrganization() = %+v, %v; want requests 21 and 22 queued", result, err)
	}
	for index, kind := range []string{models.OtelReplayKindMetrics, models.OtelReplayKindLogs} {
		if queuedAll[index].Kind != kind || queuedAll[index].RequestedForConnectionId == nil || *queuedAll[index].RequestedForConnectionId != 4 {
			t.Fatalf("queued request %d = %+v, want %s for connection 4", index, queuedAll[index], kind)
		}
	}
}

func TestRebindOtelOrganizationRollsBackWhenReplayPlanFails(t *testing.T) {
	tx := dalmocks.NewTransaction(t)
	expectOtelConnectionLock(t, tx, models.OtelConnection{Model: common.Model{ID: 4}})
	var updated *models.OtelConnection
	var audit *models.OtelAuditEvent
	expectRebindWrites(tx, &updated, &audit)
	tx.EXPECT().Rollback().Return(nil).Once()
	newRebindTestDal(t, tx)

	_, err := RebindOtelOrganization(nil, 4, &OtelRebindInput{OrganizationId: rebindNewOrganization, Replay: &OtelReplayRange{StartDate: "bad", EndDate: "bad"}})
	requireHttpCode(t, err, http.StatusBadRequest)
	tx.AssertNotCalled(t, "Commit")
}

func TestListOtelReplaysValidatesPaging(t *testing.T) {
	for _, paging := range [][2]int{{0, 20}, {1, 0}, {1, 101}} {
		useReplayTestDal(t, dalmocks.NewDal(t))
		_, err := ListOtelReplays(paging[0], paging[1])
		requireHttpCode(t, err, http.StatusBadRequest)
	}

	connectionId := uint64(4)
	database := dalmocks.NewDal(t)
	database.EXPECT().Count(mock.Anything).Return(int64(3), nil)
	database.On("All", mock.AnythingOfType("*[]*models.OtelReplayRequest"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*[]*models.OtelReplayRequest) = []*models.OtelReplayRequest{
			{Model: common.Model{ID: 3}, Status: models.OtelReplayRequestStatusCompleted, RequestedForConnectionId: &connectionId},
			{Model: common.Model{ID: 2}, Status: models.OtelReplayRequestStatusFailed, RequestedForConnectionId: &connectionId},
			{Model: common.Model{ID: 1}, Status: models.OtelReplayRequestStatusCompleted},
		}
	}).Return(nil).Once()
	useReplayTestDal(t, database)

	page, err := ListOtelReplays(1, 20)
	if err != nil || page.Count != 3 || len(page.Replays) != 3 {
		t.Fatalf("ListOtelReplays() = %+v, %v", page, err)
	}
	if page.Replays[0].Id != 3 || *page.Replays[0].RequestedForConnectionId != connectionId || page.Replays[2].RequestedForConnectionId != nil {
		t.Fatalf("replays = %+v", page.Replays)
	}
	database.AssertNumberOfCalls(t, "All", 1)
}

func TestActiveOtelReplayReturnsKind(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.On("First", mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*models.OtelReplayRequest) = models.OtelReplayRequest{Model: common.Model{ID: 6}, Kind: models.OtelReplayKindLogs, Status: models.OtelReplayRequestStatusProcessing}
	}).Return(nil).Once()
	useReplayTestDal(t, database)

	active, err := activeOtelReplay(replayTestNow)
	if err != nil || active == nil || active.Id != 6 || active.Kind != models.OtelReplayKindLogs {
		t.Fatalf("activeOtelReplay() = %+v, %v; want logs request 6", active, err)
	}
}
