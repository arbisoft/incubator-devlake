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
	"net/http"
	"net/url"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/stretchr/testify/require"
)

const (
	testLogGroup  = "/aws/codebuild/acme-prod-deploy"
	testLogStream = "release/00000003-1111-4111-8111-000000000000"
)

// awsErrorOf builds the error the AWS response hook returns for an AWS error answer.
func awsErrorOf(status int, code string) errors.Error {
	return errors.HttpStatus(status).Wrap(&api.AwsApiError{StatusCode: status, Code: code}, "AWS request failed")
}

func TestReadAwsLogEventsStopsWhenTheTokenRepeats(t *testing.T) {
	pages := map[string]AwsGetLogEventsOutput{
		"":    {Events: []AwsLogEvent{{Timestamp: 1, Message: "a"}}, NextForwardToken: "f/1"},
		"f/1": {Events: []AwsLogEvent{{Timestamp: 2, Message: "b"}, {Timestamp: 3, Message: "c"}}, NextForwardToken: "f/2"},
		"f/2": {NextForwardToken: "f/2"},
	}
	var sent []AwsGetLogEventsInput
	events, err := readAwsLogEvents(func(input AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error) {
		sent = append(sent, input)
		page := pages[input.NextToken]
		return &page, nil
	}, testLogGroup, testLogStream)
	require.Nil(t, err)
	require.Equal(t, []AwsLogEvent{{1, "a"}, {2, "b"}, {3, "c"}}, events)
	require.Len(t, sent, 3)
	for i, wantToken := range []string{"", "f/1", "f/2"} {
		require.Equal(t, wantToken, sent[i].NextToken)
		require.True(t, sent[i].StartFromHead)
		require.Equal(t, testLogGroup, sent[i].LogGroupName)
		require.Equal(t, testLogStream, sent[i].LogStreamName)
	}
}

func TestReadAwsLogEventsWithoutAnyTokenEndsAfterOnePage(t *testing.T) {
	calls := 0
	events, err := readAwsLogEvents(func(AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error) {
		calls++
		return &AwsGetLogEventsOutput{}, nil
	}, testLogGroup, testLogStream)
	require.Nil(t, err)
	require.Empty(t, events)
	require.Equal(t, 1, calls)
}

func TestFetchAwsLogPageRetriesThrottledAndNetworkFailures(t *testing.T) {
	t.Run("succeeds on the second attempt", func(t *testing.T) {
		calls := 0
		out, err := fetchAwsLogPage(func(AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error) {
			calls++
			if calls == 1 {
				return nil, awsErrorOf(http.StatusTooManyRequests, "throttled")
			}
			return &AwsGetLogEventsOutput{NextForwardToken: "t"}, nil
		}, AwsGetLogEventsInput{})
		require.Nil(t, err)
		require.Equal(t, "t", out.NextForwardToken)
		require.Equal(t, 2, calls)
	})
	t.Run("fails after three attempts", func(t *testing.T) {
		calls := 0
		_, err := fetchAwsLogPage(func(AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error) {
			calls++
			return nil, awsErrorOf(http.StatusTooManyRequests, "throttled")
		}, AwsGetLogEventsInput{})
		require.NotNil(t, err)
		require.Equal(t, awsLogReadAttempts, calls)
	})
	t.Run("retries a network failure", func(t *testing.T) {
		calls := 0
		out, err := fetchAwsLogPage(func(AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error) {
			calls++
			if calls == 1 {
				return nil, errors.Default.Wrap(&url.Error{Op: "Post", URL: "https://logs.us-east-2.amazonaws.com/", Err: errors.Default.New("read: operation timed out")}, "request failed")
			}
			return &AwsGetLogEventsOutput{NextForwardToken: "t"}, nil
		}, AwsGetLogEventsInput{})
		require.Nil(t, err)
		require.Equal(t, "t", out.NextForwardToken)
		require.Equal(t, 2, calls)
	})
	t.Run("does not retry other errors", func(t *testing.T) {
		calls := 0
		_, err := fetchAwsLogPage(func(AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error) {
			calls++
			return nil, awsErrorOf(http.StatusForbidden, "denied")
		}, AwsGetLogEventsInput{})
		require.NotNil(t, err)
		require.Equal(t, 1, calls)
	})
}

func TestIsAwsLogMissing(t *testing.T) {
	missing := errors.HttpStatus(http.StatusBadRequest).Wrap(&api.AwsApiError{StatusCode: http.StatusBadRequest, Code: awsErrResourceNotFound}, "AWS request failed")
	require.True(t, isAwsLogMissing(missing))
	require.False(t, isAwsLogMissing(errors.HttpStatus(http.StatusBadRequest).Wrap(&api.AwsApiError{StatusCode: http.StatusBadRequest, Code: "InvalidParameterException"}, "AWS request failed")))
	require.False(t, isAwsLogMissing(awsErrorOf(http.StatusBadRequest, "other")))
}

func TestAwsSignalRowsNumberEachTypeFromOne(t *testing.T) {
	signals := []awsLogSignal{
		{Type: models.AwsLogPatternTrivy, Target: "a", Total: intPtr(3), LoggedAt: testLogTime},
		{Type: models.AwsLogPatternSmokeTest, Result: "passed", LoggedAt: testLogTime},
		{Type: models.AwsLogPatternTrivy, Target: "b", LoggedAt: testLogTime},
	}
	rows := awsSignalRows(1, "arn:aws:codepipeline:us-east-2:111122223333:acme", "build-1", signals)
	require.Len(t, rows, 3)
	require.Equal(t, []int{1, 1, 2}, []int{rows[0].Seq, rows[1].Seq, rows[2].Seq})
	require.Equal(t, "TRIVY", rows[0].SignalType)
	require.Equal(t, "SMOKE_TEST", rows[1].SignalType)
	require.Equal(t, 3, *rows[0].Total)
	require.Nil(t, rows[2].Total)
	require.Equal(t, testLogTime, *rows[0].LoggedAt)
	require.Equal(t, "passed", rows[1].Result)
}

func TestAwsPatternRows(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, testSmokePattern, "")
	applied := patterns.applicable(true)
	t.Run("available log records the counts and the pattern text", func(t *testing.T) {
		result := &awsLogParseResult{Counts: map[models.AwsLogPatternName]int{models.AwsLogPatternTrivy: 2, models.AwsLogPatternSmokeTest: 0}}
		rows := awsPatternRows(1, "arn", "build-1", applied, result)
		require.Len(t, rows, 2)
		require.Equal(t, 2, *rows[0].MatchCount)
		require.Equal(t, 0, *rows[1].MatchCount)
		require.Equal(t, testTrivyPattern, rows[0].Pattern)
		require.Equal(t, "SMOKE_TEST", rows[1].PatternName)
	})
	t.Run("unavailable log leaves the counts NULL", func(t *testing.T) {
		rows := awsPatternRows(1, "arn", "build-1", applied, nil)
		require.Len(t, rows, 2)
		require.Nil(t, rows[0].MatchCount)
		require.Nil(t, rows[1].MatchCount)
	})
}

func TestAwsLogPatternsApplicable(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, testSmokePattern, testRollbackPattern)
	names := func(deployment bool) []models.AwsLogPatternName {
		var out []models.AwsLogPatternName
		for _, pattern := range patterns.applicable(deployment) {
			out = append(out, pattern.Name)
		}
		return out
	}
	require.Equal(t, []models.AwsLogPatternName{models.AwsLogPatternTrivy}, names(false))
	require.Equal(t, []models.AwsLogPatternName{models.AwsLogPatternTrivy, models.AwsLogPatternSmokeTest, models.AwsLogPatternRollback}, names(true))
}
