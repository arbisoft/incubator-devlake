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
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/models/domainlayer/devops"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/stretchr/testify/require"
)

func TestExecutionStatusMap(t *testing.T) {
	tests := []struct {
		status models.AwsExecutionStatus
		result string
		done   string
	}{
		{models.AwsExecutionSucceeded, devops.RESULT_SUCCESS, devops.STATUS_DONE},
		{models.AwsExecutionFailed, devops.RESULT_FAILURE, devops.STATUS_DONE},
		{models.AwsExecutionStopped, "", devops.STATUS_DONE},
		{models.AwsExecutionCancelled, "", devops.STATUS_DONE},
		{models.AwsExecutionSuperseded, "", devops.STATUS_DONE},
		{models.AwsExecutionInProgress, "", devops.STATUS_IN_PROGRESS},
		{models.AwsExecutionStopping, "", devops.STATUS_IN_PROGRESS},
		{"Unheard", "", devops.STATUS_OTHER},
	}
	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			require.Equal(t, awsCicdStatus{Result: tt.result, Status: tt.done}, cicdStatusOf(awsExecutionStatuses, string(tt.status)))
		})
	}
}

func TestActionStatusMap(t *testing.T) {
	tests := []struct {
		status models.AwsActionStatus
		result string
		done   string
	}{
		{models.AwsActionSucceeded, devops.RESULT_SUCCESS, devops.STATUS_DONE},
		{models.AwsActionFailed, devops.RESULT_FAILURE, devops.STATUS_DONE},
		{models.AwsActionAbandoned, "", devops.STATUS_DONE},
		{models.AwsActionInProgress, "", devops.STATUS_IN_PROGRESS},
		{"Unheard", "", devops.STATUS_OTHER},
	}
	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			require.Equal(t, awsCicdStatus{Result: tt.result, Status: tt.done}, cicdStatusOf(awsActionStatuses, string(tt.status)))
		})
	}
}

func TestAwsTaskDatesFinishOnlyWhenDone(t *testing.T) {
	start := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	update := start.Add(90 * time.Second)
	dates, duration := awsTaskDates(&start, &update, awsDone)
	require.Equal(t, &update, dates.FinishedDate)
	require.Equal(t, 90.0, duration)
	dates, duration = awsTaskDates(&start, &update, awsInProgress)
	require.Nil(t, dates.FinishedDate)
	require.Zero(t, duration)
	require.Equal(t, start, dates.CreatedDate)
}
