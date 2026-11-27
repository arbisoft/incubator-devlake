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

package tasks

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/stretchr/testify/require"
)

func TestExecutionCutoff(t *testing.T) {
	since := time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)
	olderUnfinished := since.Add(-48 * time.Hour)
	newerUnfinished := since.Add(48 * time.Hour)
	tests := []struct {
		name             string
		since            *time.Time
		oldestUnfinished *time.Time
		want             *time.Time
	}{
		{"no state", nil, nil, nil},
		{"no state with an unfinished run", nil, &olderUnfinished, nil},
		{"state only", &since, nil, &since},
		{"unfinished run older than state", &since, &olderUnfinished, &olderUnfinished},
		{"unfinished run newer than state", &since, &newerUnfinished, &since},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, executionCutoff(tt.since, tt.oldestUnfinished))
		})
	}
}

func executionStartingAt(t *testing.T, id string, start time.Time) json.RawMessage {
	seconds := float64(start.Unix())
	raw, err := json.Marshal(AwsPipelineExecutionSummary{PipelineExecutionId: id, StartTime: &seconds})
	require.NoError(t, err)
	return raw
}

func TestTakeExecutionsSince(t *testing.T) {
	cutoff := time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)
	items := []json.RawMessage{
		executionStartingAt(t, "new", cutoff.Add(time.Hour)),
		executionStartingAt(t, "edge", cutoff),
		executionStartingAt(t, "old", cutoff.Add(-time.Hour)),
		executionStartingAt(t, "older", cutoff.Add(-2*time.Hour)),
	}
	kept, reached, err := takeExecutionsSince(items, &cutoff)
	require.NoError(t, err)
	require.True(t, reached)
	require.Equal(t, items[:2], kept)

	kept, reached, err = takeExecutionsSince(items[:2], &cutoff)
	require.NoError(t, err)
	require.False(t, reached)
	require.Len(t, kept, 2)

	kept, reached, err = takeExecutionsSince(items, nil)
	require.NoError(t, err)
	require.False(t, reached)
	require.Len(t, kept, 4)
}

func TestParseExecutionsSinceStopsAtCutoff(t *testing.T) {
	cutoff := time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)
	newStart := float64(cutoff.Add(time.Hour).Unix())
	oldStart := float64(cutoff.Add(-time.Hour).Unix())
	body, err := json.Marshal(AwsListPipelineExecutionsOutput{PipelineExecutionSummaries: []AwsPipelineExecutionSummary{
		{PipelineExecutionId: "new", StartTime: &newStart},
		{PipelineExecutionId: "old", StartTime: &oldStart},
	}})
	require.NoError(t, err)
	res := newJsonResponse(http.StatusOK, string(body))
	rows, parseErr := parseExecutionsSince(&cutoff)(res)
	require.True(t, errors.Is(parseErr, api.ErrFinishCollect))
	require.Len(t, rows, 1)
	require.Contains(t, string(rows[0]), `"new"`)
}
