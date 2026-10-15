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

func TestRequeueLogBatchesResetsReplayableBatchesToPending(t *testing.T) {
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	expectReplayLeases(transaction, testReplayWorkerID)
	transaction.EXPECT().Count(mock.Anything, mock.Anything).Return(2, nil)
	requeued := make(map[string]interface{})
	transaction.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(
		func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
			for _, set := range sets {
				requeued[set.ColumnName] = set.Value
			}
		},
	).Return(nil)
	transaction.EXPECT().Commit().Return(nil)
	finished := expectFinishReplay(database)

	replayed, err := newLogReplayConverter(database).requeueLogBatches(newLogReplayRequest(models.OtelReplayKindLogs), testReplayLeaseOwner)
	if err != nil || replayed != 2 {
		t.Fatalf("requeueLogBatches() = %d, %v; want 2 requeued batches", replayed, err)
	}
	if requeued["status"] != models.OtelBatchStatusPending || requeued["attempt_count"] != 0 {
		t.Fatalf("requeued status/attempts = %v/%v; want pending with a fresh retry budget", requeued["status"], requeued["attempt_count"])
	}
	for _, column := range []string{"next_attempt_at", "lease_owner", "lease_until", "processing_error_code", "processing_error_message", "processed_at"} {
		if value, set := requeued[column]; !set || value != nil {
			t.Fatalf("requeued %s = %v (set %t); want cleared", column, value, set)
		}
	}
	if finished["status"] != models.OtelReplayRequestStatusCompleted || finished["replayed_batches"] != 2 {
		t.Fatalf("finished request = %v; want completed with 2 replayed batches", finished)
	}
}

func TestRequeueLogBatchesRejectsInvalidRangeWithoutTouchingBatches(t *testing.T) {
	request := newLogReplayRequest(models.OtelReplayKindLogs)
	request.RangeEnd = testReplayNow.Truncate(24*time.Hour).AddDate(0, 0, 1)
	// No Begin expectation: requeueing must not open a transaction for an invalid range.
	_, err := newLogReplayConverter(dalmocks.NewDal(t)).requeueLogBatches(request, testReplayLeaseOwner)
	if err == nil || !strings.Contains(err.Error(), "completed UTC days") {
		t.Fatalf("requeueLogBatches() error = %v; want current-day rejection", err)
	}
}

func TestRequeueLogBatchesAbortsWhenConverterLeaseWasTakenOver(t *testing.T) {
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	expectReplayLeases(transaction, "second-converter")
	transaction.EXPECT().Rollback().Return(nil)
	// No Count, UpdateColumns or finishReplay expectations: a lost lease must change nothing.

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
	database.EXPECT().Begin().Return(transaction)
	expectReplayLeases(transaction, testReplayWorkerID)
	transaction.EXPECT().Count(mock.Anything, mock.Anything).Return(3, nil)
	transaction.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(nil)
	transaction.EXPECT().Commit().Return(nil)
	finished := expectFinishReplay(database)

	processed, err := newLogReplayConverter(database).processNextReplay()
	if err != nil || !processed {
		t.Fatalf("processNextReplay() = %t, %v; want a processed request", processed, err)
	}
	if finished["status"] != models.OtelReplayRequestStatusCompleted || finished["replayed_batches"] != 3 {
		t.Fatalf("finished request = %v; want completed with 3 requeued log batches", finished)
	}
}
