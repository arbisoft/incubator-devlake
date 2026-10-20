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
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
	"github.com/stretchr/testify/require"
)

func (w *world) requireLogReplayCompleted(wantLogs int) {
	w.t.Helper()
	requests := snapshot[models.OtelReplayRequest](w, "id", "1 = 1")
	require.Len(w.t, requests, 2)
	byKind := make(map[string]models.OtelReplayRequest, len(requests))
	for _, request := range requests {
		require.Equal(w.t, models.OtelReplayRequestStatusCompleted, request.Status)
		byKind[request.Kind] = request
	}
	metrics, hasMetrics := byKind[models.OtelReplayKindMetrics]
	logs, hasLogs := byKind[models.OtelReplayKindLogs]
	require.True(w.t, hasMetrics)
	require.True(w.t, hasLogs)
	require.Zero(w.t, metrics.ReplayedBatches)
	require.Equal(w.t, wantLogs, logs.ReplayedBatches)
}

func TestRebindReplaysDelayedLogsByObservedDay(t *testing.T) {
	w := newWorld(t)
	a := w.connection("alpha", orgW, w.day(-5))
	b := w.connection("beta", orgB, w.day(-5))
	batch := w.insertLogBatch([]resourceSpec{
		{who: a1, at: w.day(-2).Add(8 * time.Hour), seed: 801},
		{who: b1, at: w.day(-2).Add(9 * time.Hour), seed: 802},
	})
	receivedAt := w.day(-1).Add(time.Hour)
	require.NoError(t, w.tester.Dal.UpdateColumns(&models.OtelLogBatch{}, []dal.DalSet{{ColumnName: "received_at", Value: receivedAt}}, dal.Where("id = ?", batch.ID)))
	w.drainNow()

	require.Zero(t, w.count(&models.OtelEvent{}, "connection_id = ? AND organization_id = ?", a.ID, orgR))
	require.Zero(t, w.count(&ai.AiPrompt{}, "workspace_key = ?", orgR))
	beforeB := w.logFactsOf(b.ID, orgB)
	require.NotEmpty(t, beforeB.Events)
	require.NotEmpty(t, beforeB.Prompt)

	w.rebind(a, orgR, w.replayDates(-2, -2))
	w.drainNow()

	w.requireLogsOn(a.ID, orgR, a1, w.day(-2))
	require.Equal(t, beforeB, w.logFactsOf(b.ID, orgB))
	w.requireLogReplayCompleted(1)
}

func TestRebindRevokedConnectionReplaysOnlyItsObservedDay(t *testing.T) {
	w := newWorld(t)
	revokedAt := w.day(-1)
	revoked := w.connection("delta", orgW, w.day(-5))
	revoked.Status = models.OtelConnectionStatusRevoked
	revoked.RevokedAt = &revokedAt
	require.NoError(t, w.tester.Dal.Update(revoked))
	successor := w.connection("delta", orgR, revokedAt)

	oldBatch := w.insertLogBatch([]resourceSpec{{who: d1, at: w.day(-2).Add(8 * time.Hour), seed: 811}})
	todayBatch := w.insertLogBatch([]resourceSpec{{who: d3, at: w.now, seed: 812}})
	for _, batch := range []*models.OtelLogBatch{oldBatch, todayBatch} {
		require.NoError(t, w.tester.Dal.UpdateColumns(&models.OtelLogBatch{}, []dal.DalSet{{ColumnName: "received_at", Value: w.now}}, dal.Where("id = ?", batch.ID)))
	}
	w.drainNow()

	require.Zero(t, w.count(&models.OtelEvent{}, "connection_id = ? AND organization_id = ?", revoked.ID, orgR))
	require.Zero(t, w.count(&ai.AiPrompt{}, "workspace_key = ? AND user_key = ?", orgR, d1.logUserKey()))
	beforeSuccessor := w.logFactsOf(successor.ID, orgR)
	require.NotEmpty(t, beforeSuccessor.Events)
	require.NotEmpty(t, beforeSuccessor.Prompt)
	beforeSuccessorPrompts := snapshot[ai.AiPrompt](w, "workspace_key, prompt_id", "workspace_key = ? AND user_key = ?", orgR, d3.logUserKey())

	w.rebind(revoked, orgR, w.replayDates(-2, -2))
	w.drainNow()

	w.requireLogsOn(revoked.ID, orgR, d1, w.day(-2))
	afterSuccessor := w.logFactsOf(successor.ID, orgR)
	require.Equal(t, beforeSuccessor.Events, afterSuccessor.Events)
	require.Equal(t, beforeSuccessorPrompts, snapshot[ai.AiPrompt](w, "workspace_key, prompt_id", "workspace_key = ? AND user_key = ?", orgR, d3.logUserKey()))
	w.requireLogReplayCompleted(1)
}

func TestLogReplayObservedDateBoundariesAndFallback(t *testing.T) {
	w := newWorld(t)
	w.connection("alpha", orgR, w.day(-5))
	start, end := w.day(-2), w.day(-1)
	outsideReceipt := start.Add(-time.Hour)
	insideReceipt := start.Add(time.Hour)
	observed := func(at time.Time) *time.Time { return &at }
	cases := []struct {
		name       string
		min        *time.Time
		max        *time.Time
		receivedAt time.Time
		selected   bool
		batch      *models.OtelLogBatch
	}{
		{name: "valid in-window bounds and receipt outside", min: observed(start.Add(2 * time.Hour)), max: observed(start.Add(3 * time.Hour)), receivedAt: outsideReceipt, selected: true},
		{name: "valid outside-window bounds and receipt inside", min: observed(start.Add(-48 * time.Hour)), max: observed(start.Add(-47 * time.Hour)), receivedAt: insideReceipt},
		{name: "maximum equals range start", min: observed(start.Add(-time.Hour)), max: observed(start), receivedAt: outsideReceipt, selected: true},
		{name: "minimum equals range end", min: observed(end), max: observed(end.Add(time.Hour)), receivedAt: insideReceipt},
		{name: "both bounds missing and receipt inside", receivedAt: insideReceipt, selected: true},
		{name: "one bound missing and receipt inside", min: observed(start.Add(time.Hour)), receivedAt: insideReceipt, selected: true},
		{name: "reversed bounds and receipt inside", min: observed(start.Add(3 * time.Hour)), max: observed(start.Add(2 * time.Hour)), receivedAt: insideReceipt, selected: true},
		{name: "unknown bounds and receipt outside", receivedAt: outsideReceipt},
	}
	for index := range cases {
		cases[index].batch = w.insertLogBatch([]resourceSpec{{who: a1, at: start.Add(4*time.Hour + time.Duration(index)*time.Minute), seed: 900 + index}})
	}
	w.drainNow()

	sentinel := w.day(-5).Add(12 * time.Hour)
	for _, testCase := range cases {
		err := w.tester.Dal.UpdateColumns(&models.OtelLogBatch{}, []dal.DalSet{
			{ColumnName: "min_observed_at", Value: testCase.min},
			{ColumnName: "max_observed_at", Value: testCase.max},
			{ColumnName: "received_at", Value: testCase.receivedAt},
			{ColumnName: "processed_at", Value: &sentinel},
		}, dal.Where("id = ?", testCase.batch.ID))
		require.NoError(t, err, testCase.name)
	}
	_, err := service.CreateOtelReplay(e2eUser, &service.OtelReplayInput{OtelReplayRange: w.replayDates(-2, -2)})
	require.NoError(t, err)
	w.drainNow()

	selectedCount := 0
	for _, testCase := range cases {
		rows := snapshot[models.OtelLogBatch](w, "id", "id = ?", testCase.batch.ID)
		require.Len(t, rows, 1, testCase.name)
		require.Equal(t, models.OtelBatchStatusProcessed, rows[0].Status, testCase.name)
		require.NotNil(t, rows[0].ProcessedAt, testCase.name)
		if testCase.selected {
			selectedCount++
			require.NotEqual(t, sentinel, *rows[0].ProcessedAt, testCase.name)
		} else {
			require.Equal(t, sentinel, *rows[0].ProcessedAt, testCase.name)
		}
	}
	w.requireLogReplayCompleted(selectedCount)
}
