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
	stdErrors "errors"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/common"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
)

const (
	testReplayWorkerID   = "replay-worker"
	testReplayLeaseOwner = "replay-lease-owner"
)

var testReplayNow = time.Date(2026, 10, 15, 10, 0, 0, 0, time.UTC)

func newLogReplayRequest(kind string) *models.OtelReplayRequest {
	today := testReplayNow.Truncate(24 * time.Hour)
	return &models.OtelReplayRequest{
		Model:      common.Model{ID: 9},
		Kind:       kind,
		RangeStart: today.AddDate(0, 0, -2),
		RangeEnd:   today,
		Status:     models.OtelReplayRequestStatusProcessing,
	}
}

func newLogReplayConverter(database dal.Dal) *rawConverter {
	converter := newRawConverter(database, nil)
	converter.workerID = testReplayWorkerID
	converter.now = func() time.Time { return testReplayNow }
	return converter
}

// expectReplayLeases makes the transaction's request and converter lease checks succeed,
// or report another converter as the leader.
func expectReplayLeases(transaction *dalmocks.Transaction, converterOwner string) {
	transaction.EXPECT().First(mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Return(nil)
	transaction.EXPECT().First(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Run(
		func(lease interface{}, _ ...dal.Clause) {
			lease.(*models.OtelConverterLease).Owner = converterOwner
			lease.(*models.OtelConverterLease).LeaseUntil = testReplayNow.Add(time.Minute)
		},
	).Return(nil)
}

// expectFinishReplay captures the columns finishReplay writes on the request row.
func expectFinishReplay(database *dalmocks.Dal) map[string]interface{} {
	finished := make(map[string]interface{})
	database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Run(
		func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
			for _, set := range sets {
				finished[set.ColumnName] = set.Value
			}
		},
	).Return(nil).Once()
	return finished
}

// expectRenewReplayLease makes the replay renew its request lease and the converter lease
// once, as it does before its first page.
func expectRenewReplayLease(t *testing.T, database *dalmocks.Dal) {
	database.EXPECT().UpdateColumn(mock.AnythingOfType("*models.OtelReplayRequest"), "lease_until", mock.Anything, mock.Anything).Return(nil).Once()
	database.EXPECT().First(mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything).Return(nil).Once()
	leaseTransaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(leaseTransaction).Once()
	leaseTransaction.EXPECT().CreateIfNotExist(mock.AnythingOfType("*models.OtelConverterLease")).Return(nil)
	leaseTransaction.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Return(nil)
	leaseTransaction.EXPECT().First(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Run(
		func(lease interface{}, _ ...dal.Clause) {
			lease.(*models.OtelConverterLease).Owner = testReplayWorkerID
		},
	).Return(nil)
	leaseTransaction.EXPECT().Commit().Return(nil)
}

// expectRequeuePage makes one requeue transaction find batchIDs and returns the columns and
// clauses it writes.
func expectRequeuePage(transaction *dalmocks.Transaction, batchIDs []uint64) (map[string]interface{}, *[]dal.Clause) {
	expectReplayLeases(transaction, testReplayWorkerID)
	var selection []dal.Clause
	transaction.EXPECT().Pluck("id", mock.AnythingOfType("*[]uint64"), mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(
		func(_ string, dest interface{}, clauses ...dal.Clause) {
			*dest.(*[]uint64) = batchIDs
			selection = clauses
		},
	).Return(nil).Once()
	requeued := make(map[string]interface{})
	if len(batchIDs) > 0 {
		transaction.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(
			func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
				for _, set := range sets {
					requeued[set.ColumnName] = set.Value
				}
			},
		).Return(nil).Once()
	}
	transaction.EXPECT().Commit().Return(nil).Once()
	return requeued, &selection
}

func TestRequeueLogBatchesQueuesReceivedBatchesBehindLiveOnes(t *testing.T) {
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	expectRenewReplayLease(t, database)
	database.EXPECT().Begin().Return(transaction).Once()
	requeued, selection := expectRequeuePage(transaction, []uint64{4, 7})
	finished := expectFinishReplay(database)
	request := newLogReplayRequest(models.OtelReplayKindLogs)

	replayed, err := newLogReplayConverter(database).requeueLogBatches(request, testReplayLeaseOwner)
	if err != nil || replayed != 2 {
		t.Fatalf("requeueLogBatches() = %d, %v; want 2 requeued batches", replayed, err)
	}
	// Batches are chosen by the server's received_at, so batches without valid record
	// timestamps or from a client whose clock is ahead are included.
	where := (*selection)[1].Data.(dal.DalClause)
	if !strings.Contains(where.Expr, "received_at >= ? AND received_at < ?") || strings.Contains(where.Expr, "observed_at") ||
		where.Params[1] != request.RangeStart || where.Params[2] != request.RangeEnd {
		t.Fatalf("requeue selection = %s %v; want batches received in the range", where.Expr, where.Params)
	}
	// A rerun after a lost lease counts the batches an earlier run queued, unless one is
	// being converted, so its count covers the whole range.
	requeueable := (*selection)[2].Data.(dal.DalClause)
	if !strings.Contains(requeueable.Expr, "status = ? AND (lease_until IS NULL OR lease_until < ?)") ||
		requeueable.Params[1] != models.OtelBatchStatusReplayPending || requeueable.Params[2] != testReplayNow {
		t.Fatalf("requeueable filter = %s %v; want terminal batches and unleased replay_pending batches", requeueable.Expr, requeueable.Params)
	}
	if requeued["status"] != models.OtelBatchStatusReplayPending || requeued["attempt_count"] != 0 {
		t.Fatalf("requeued status/attempts = %v/%v; want replay_pending with a fresh retry budget", requeued["status"], requeued["attempt_count"])
	}
	for _, column := range []string{"next_attempt_at", "lease_owner", "lease_until", "processing_error_code", "processing_error_message"} {
		if value, set := requeued[column]; !set || value != nil {
			t.Fatalf("requeued %s = %v (set %t); want cleared", column, value, set)
		}
	}
	// processed_at is kept until the replayed conversion records a new terminal state.
	if _, set := requeued["processed_at"]; set {
		t.Fatalf("requeued columns = %v; want processed_at kept", requeued)
	}
	if finished["status"] != models.OtelReplayRequestStatusCompleted || finished["replayed_batches"] != 2 {
		t.Fatalf("finished request = %v; want completed with 2 replayed batches", finished)
	}
}

// applyRequeueUpdate applies the requeue's column sets to the rows its id and status
// filter matches, as the database would.
func applyRequeueUpdate(t *testing.T, rows []*models.OtelLogBatch, sets []dal.DalSet, clauses []dal.Clause) {
	if len(clauses) != 1 {
		t.Fatalf("requeue update clauses = %v; want one id and status filter", clauses)
	}
	where := clauses[0].Data.(dal.DalClause)
	if where.Expr != "id IN ? AND status IN ?" {
		t.Fatalf("requeue update filter = %s; want id IN ? AND status IN ?", where.Expr)
	}
	ids, statuses := where.Params[0].([]uint64), where.Params[1].([]string)
	for _, row := range rows {
		if !containsValue(ids, row.ID) || !containsValue(statuses, row.Status) {
			continue
		}
		for _, set := range sets {
			switch set.ColumnName {
			case "status":
				row.Status = set.Value.(string)
			case "attempt_count":
				row.AttemptCount = set.Value.(int)
			case "next_attempt_at":
				row.NextAttemptAt = nil
			case "lease_owner":
				row.LeaseOwner = nil
			case "lease_until":
				row.LeaseUntil = nil
			case "processing_error_code":
				row.ProcessingErrorCode = nil
			case "processing_error_message":
				row.ProcessingErrorMessage = nil
			default:
				t.Fatalf("requeue update sets unexpected column %s", set.ColumnName)
			}
		}
	}
}

func containsValue[T comparable](values []T, value T) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

// An overlapping or repeated replay counts a batch an earlier replay already queued, but
// must not reset its retry budget or erase the error that explains why it keeps failing.
func TestRequeueLogBatchesKeepsRetryStateOfBatchesAlreadyQueuedForReplay(t *testing.T) {
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	expectRenewReplayLease(t, database)
	database.EXPECT().Begin().Return(transaction).Once()
	expectReplayLeases(transaction, testReplayWorkerID)
	nextAttemptAt := testReplayNow.Add(10 * time.Minute)
	pendingCode, pendingMessage := "conversion_failed", "connection not found"
	quarantinedCode, quarantinedMessage := "retry_exhausted", "conversion failed after 12 attempts"
	backingOff := &models.OtelLogBatch{Model: common.Model{ID: 4}, Status: models.OtelBatchStatusReplayPending, AttemptCount: 5,
		NextAttemptAt: &nextAttemptAt, ProcessingErrorCode: &pendingCode, ProcessingErrorMessage: &pendingMessage}
	quarantined := &models.OtelLogBatch{Model: common.Model{ID: 7}, Status: models.OtelBatchStatusPermanentError, AttemptCount: 12,
		ProcessingErrorCode: &quarantinedCode, ProcessingErrorMessage: &quarantinedMessage}
	rows := []*models.OtelLogBatch{backingOff, quarantined}
	transaction.EXPECT().Pluck("id", mock.AnythingOfType("*[]uint64"), mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(
		func(_ string, dest interface{}, _ ...dal.Clause) {
			*dest.(*[]uint64) = []uint64{4, 7}
		},
	).Return(nil).Once()
	transaction.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(
		func(_ interface{}, sets []dal.DalSet, clauses ...dal.Clause) {
			applyRequeueUpdate(t, rows, sets, clauses)
		},
	).Return(nil).Once()
	transaction.EXPECT().Commit().Return(nil).Once()
	finished := expectFinishReplay(database)

	replayed, err := newLogReplayConverter(database).requeueLogBatches(newLogReplayRequest(models.OtelReplayKindLogs), testReplayLeaseOwner)
	if err != nil || replayed != 2 {
		t.Fatalf("requeueLogBatches() = %d, %v; want both batches counted", replayed, err)
	}
	if finished["replayed_batches"] != 2 {
		t.Fatalf("finished request = %v; want 2 replayed batches", finished)
	}
	if quarantined.Status != models.OtelBatchStatusReplayPending || quarantined.AttemptCount != 0 ||
		quarantined.ProcessingErrorCode != nil || quarantined.ProcessingErrorMessage != nil {
		t.Fatalf("quarantined batch = %+v; want replay_pending with a fresh retry budget and no error", quarantined)
	}
	if backingOff.Status != models.OtelBatchStatusReplayPending || backingOff.AttemptCount != 5 ||
		backingOff.NextAttemptAt == nil || !backingOff.NextAttemptAt.Equal(nextAttemptAt) ||
		backingOff.ProcessingErrorCode == nil || *backingOff.ProcessingErrorCode != pendingCode ||
		backingOff.ProcessingErrorMessage == nil || *backingOff.ProcessingErrorMessage != pendingMessage {
		t.Fatalf("batch already queued for replay = %+v; want its attempts, backoff and error kept", backingOff)
	}
}

func TestRequeueLogBatchesPagesByBatchID(t *testing.T) {
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	expectRenewReplayLease(t, database)
	database.EXPECT().Begin().Return(transaction).Times(2)
	fullPage := make([]uint64, logReplayPage)
	for i := range fullPage {
		fullPage[i] = uint64(i + 1)
	}
	_, firstSelection := expectRequeuePage(transaction, fullPage)
	_, lastSelection := expectRequeuePage(transaction, nil)
	finished := expectFinishReplay(database)
	request := newLogReplayRequest(models.OtelReplayKindLogs)
	// A logs replay may include the current UTC day.
	request.RangeEnd = testReplayNow.Truncate(24*time.Hour).AddDate(0, 0, 1)

	replayed, err := newLogReplayConverter(database).requeueLogBatches(request, testReplayLeaseOwner)
	if err != nil || replayed != logReplayPage {
		t.Fatalf("requeueLogBatches() = %d, %v; want %d requeued batches", replayed, err, logReplayPage)
	}
	if after := (*firstSelection)[1].Data.(dal.DalClause).Params[0]; after != uint64(0) {
		t.Fatalf("first page starts after batch %v, want 0", after)
	}
	if after := (*lastSelection)[1].Data.(dal.DalClause).Params[0]; after != uint64(logReplayPage) {
		t.Fatalf("second page starts after batch %v, want %d", after, logReplayPage)
	}
	if finished["replayed_batches"] != logReplayPage {
		t.Fatalf("finished request = %v; want %d replayed batches", finished, logReplayPage)
	}
}

// The converter lease was taken at the start of the poll, before retention ran, so the
// requeue renews both leases before its first page instead of trusting them.
func TestRequeueLogBatchesAbortsWhenFirstRenewalFindsAnotherLeader(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.EXPECT().UpdateColumn(mock.AnythingOfType("*models.OtelReplayRequest"), "lease_until", mock.Anything, mock.Anything).Return(nil).Once()
	database.EXPECT().First(mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything).Return(nil).Once()
	leaseTransaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(leaseTransaction).Once()
	leaseTransaction.EXPECT().CreateIfNotExist(mock.AnythingOfType("*models.OtelConverterLease")).Return(nil)
	leaseTransaction.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Return(nil)
	leaseTransaction.EXPECT().First(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Run(
		func(lease interface{}, _ ...dal.Clause) {
			lease.(*models.OtelConverterLease).Owner = "second-converter"
		},
	).Return(nil)
	leaseTransaction.EXPECT().Commit().Return(nil)
	// No page transaction: no batch is requeued once another converter leads.

	_, err := newLogReplayConverter(database).requeueLogBatches(newLogReplayRequest(models.OtelReplayKindLogs), testReplayLeaseOwner)
	if !stdErrors.Is(err, errReplayLeaseLost) {
		t.Fatalf("requeueLogBatches() error = %v; want errReplayLeaseLost", err)
	}
}

func TestRequeueLogBatchesRejectsInvalidRangeWithoutTouchingBatches(t *testing.T) {
	request := newLogReplayRequest(models.OtelReplayKindLogs)
	request.RangeEnd = testReplayNow.Truncate(24*time.Hour).AddDate(0, 0, 2)
	// No Begin expectation: requeueing must not open a transaction for an invalid range.
	_, err := newLogReplayConverter(dalmocks.NewDal(t)).requeueLogBatches(request, testReplayLeaseOwner)
	if err == nil || !strings.Contains(err.Error(), "end of the current UTC day") {
		t.Fatalf("requeueLogBatches() error = %v; want future-day rejection", err)
	}
}

func TestRequeueLogBatchesAbortsWhenConverterLeaseWasTakenOver(t *testing.T) {
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	expectRenewReplayLease(t, database)
	database.EXPECT().Begin().Return(transaction)
	expectReplayLeases(transaction, "second-converter")
	transaction.EXPECT().Rollback().Return(nil)
	// No Pluck, UpdateColumns or finishReplay expectations: a lost lease must change nothing.

	_, err := newLogReplayConverter(database).requeueLogBatches(newLogReplayRequest(models.OtelReplayKindLogs), testReplayLeaseOwner)
	if !stdErrors.Is(err, errReplayLeaseLost) {
		t.Fatalf("requeueLogBatches() error = %v; want errReplayLeaseLost", err)
	}
}

// expectClaimReplay makes claimNextReplay find and lease request.
func expectClaimReplay(database *dalmocks.Dal, request *models.OtelReplayRequest) {
	database.EXPECT().First(mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Run(
		func(found interface{}, _ ...dal.Clause) {
			*found.(*models.OtelReplayRequest) = *request
		},
	).Return(nil).Times(2)
	database.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything).Return(nil).Once()
}

func TestProcessNextReplayDispatchesByKind(t *testing.T) {
	for _, test := range []struct {
		name    string
		kind    string
		message string
	}{
		{name: "unknown kind fails", kind: "traces", message: `unknown replay kind "traces"`},
		{name: "empty kind runs metric replay", kind: "", message: "completed UTC days"},
		{name: "metrics kind runs metric replay", kind: models.OtelReplayKindMetrics, message: "completed UTC days"},
	} {
		t.Run(test.name, func(t *testing.T) {
			database := dalmocks.NewDal(t)
			request := newLogReplayRequest(test.kind)
			if test.kind != "traces" {
				// An invalid range proves the request reached the metric replay without a DB write.
				request.RangeEnd = testReplayNow.Truncate(24*time.Hour).AddDate(0, 0, 1)
			}
			expectClaimReplay(database, request)
			finished := expectFinishReplay(database)

			processed, err := newLogReplayConverter(database).processNextReplay()
			if err != nil || !processed {
				t.Fatalf("processNextReplay() = %t, %v; want a processed request", processed, err)
			}
			message, _ := finished["error_message"].(*string)
			if finished["status"] != models.OtelReplayRequestStatusFailed || message == nil || !strings.Contains(*message, test.message) {
				t.Fatalf("finished request = %v (message %v); want failed with %q", finished, message, test.message)
			}
		})
	}
}

func TestProcessNextReplayRequeuesLogKind(t *testing.T) {
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	expectClaimReplay(database, newLogReplayRequest(models.OtelReplayKindLogs))
	expectRenewReplayLease(t, database)
	database.EXPECT().Begin().Return(transaction)
	expectRequeuePage(transaction, []uint64{1, 2, 3})
	finished := expectFinishReplay(database)

	processed, err := newLogReplayConverter(database).processNextReplay()
	if err != nil || !processed {
		t.Fatalf("processNextReplay() = %t, %v; want a processed request", processed, err)
	}
	if finished["status"] != models.OtelReplayRequestStatusCompleted || finished["replayed_batches"] != 3 {
		t.Fatalf("finished request = %v; want completed with 3 requeued log batches", finished)
	}
}
