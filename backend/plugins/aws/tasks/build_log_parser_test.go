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
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/stretchr/testify/require"
)

const (
	testTrivyPattern    = `Total: (\d+) \((.*)\)`
	testSmokePattern    = `(?i)smoke test (passed|failed)`
	testRollbackPattern = `(?i)(rolling .* back|rolled back|rollback)`
)

const syntheticBuildLog = `[Container] 2026/11/20 13:20:01.123456 Running command echo "INFO: Smoke test passed with HTTP ${status} on attempt ${i}"
[Container] 2026/11/20 13:20:02.000000 Running command trivy image --severity HIGH,CRITICAL ${IMAGE_URI}
WARN: Trivy enforcement is DISABLED. HIGH/CRITICAL findings will be reported but will not fail the build.

111122223333.dkr.ecr.us-east-2.amazonaws.com/acme-backend:v1.2.3 (debian 12.15)
===============================================================================
Total: 102 (HIGH: 100, CRITICAL: 2)

Python (python-pkg)
===================
Total: 77 (HIGH: 69, CRITICAL: 8)
│ example-lib │ CVE-2026-0001 │ HIGH │ fixed │ 1.0 │ 1.1 │ rollback of state in example-lib allows ... │
INFO: Running smoke test https://api.example.com/health
INFO: Smoke test passed with HTTP 200 on attempt 1
FATAL: Smoke test failed after 5 attempts. Rolling 'acme-backend' back to acme-backend-task:41`

var testLogTime = time.Date(2026, 11, 20, 13, 20, 0, 0, time.UTC)

func testLogLines(text string) []awsLogLine {
	var lines []awsLogLine
	for _, line := range strings.Split(text, "\n") {
		lines = append(lines, awsLogLine{Text: line, At: testLogTime})
	}
	return lines
}

func testPatterns(t *testing.T, trivy, smoke, rollback string) awsLogPatterns {
	patterns, err := compileAwsLogPatterns(&models.AwsScopeConfig{TrivyTotalsPattern: trivy, SmokeTestPattern: smoke, RollbackPattern: rollback})
	require.Nil(t, err)
	return patterns
}

func intPtr(n int) *int { return &n }

func signalsOfType(result awsLogParseResult, name models.AwsLogPatternName) []awsLogSignal {
	var signals []awsLogSignal
	for _, signal := range result.Signals {
		if signal.Type == name {
			signals = append(signals, signal)
		}
	}
	return signals
}

func TestParseAwsBuildLogTrivy(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, testSmokePattern, testRollbackPattern)
	result := parseAwsBuildLog(testLogLines(syntheticBuildLog), patterns, false)
	require.Equal(t, []awsLogSignal{
		{
			Type: models.AwsLogPatternTrivy, Target: "111122223333.dkr.ecr.us-east-2.amazonaws.com/acme-backend:v1.2.3 (debian 12.15)",
			Total: intPtr(102), High: intPtr(100), Critical: intPtr(2), LoggedAt: testLogTime,
		},
		{
			Type: models.AwsLogPatternTrivy, Target: "Python (python-pkg)",
			Total: intPtr(77), High: intPtr(69), Critical: intPtr(8), LoggedAt: testLogTime,
		},
	}, result.Signals)
	require.Equal(t, map[models.AwsLogPatternName]int{models.AwsLogPatternTrivy: 2}, result.Counts)
}

func TestParseAwsBuildLogDropsEchoedLines(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, testSmokePattern, "")
	lines := testLogLines("echo \"Total: 9 (HIGH: 9)\"\nTotal: 8 (LOW: 8)\nrun ${CMD} Total: 7 (LOW: 7)\nINFO: Smoke test passed")
	result := parseAwsBuildLog(lines, patterns, true)
	require.Len(t, signalsOfType(result, models.AwsLogPatternTrivy), 1)
	require.Equal(t, 8, *signalsOfType(result, models.AwsLogPatternTrivy)[0].Total)
	require.Equal(t, 1, result.Counts[models.AwsLogPatternSmokeTest])
}

func TestParseAwsBuildLogTrivyTargetLayout(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, "", "")
	tests := []struct {
		name       string
		log        string
		wantTarget string
	}{
		{"layout", "acme-image (debian)\n=====\nTotal: 1 (LOW: 1)", "acme-image (debian)"},
		{"blank line before the totals", "acme-image (debian)\n=====\n\nTotal: 1 (LOW: 1)", "acme-image (debian)"},
		{"no underline", "acme-image (debian)\nTotal: 1 (LOW: 1)", ""},
		{"first line", "Total: 1 (LOW: 1)", ""},
		{"underline without a target", "=====\nTotal: 1 (LOW: 1)", ""},
		{"underline after another underline", "=====\n=====\nTotal: 1 (LOW: 1)", ""},
		{"other text instead of an underline", "acme-image (debian)\n-----\nTotal: 1 (LOW: 1)", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseAwsBuildLog(testLogLines(tt.log), patterns, false)
			require.Len(t, result.Signals, 1)
			require.Equal(t, tt.wantTarget, result.Signals[0].Target)
		})
	}
}

func TestParseAwsBuildLogTrivyTargetIsTruncated(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, "", "")
	result := parseAwsBuildLog(testLogLines(strings.Repeat("a", 300)+"\n===\nTotal: 1 (LOW: 1)"), patterns, false)
	require.Len(t, []rune(result.Signals[0].Target), awsLogTargetLimit)
}

func TestParseAwsBuildLogTrivySeverities(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, "", "")
	result := parseAwsBuildLog(testLogLines("Total: 15 (UNKNOWN: 1, LOW: 2, MEDIUM: 3, HIGH: 4, CRITICAL: 5, OTHER: 9)"), patterns, false)
	signal := result.Signals[0]
	require.Equal(t, []*int{intPtr(15), intPtr(1), intPtr(2), intPtr(3), intPtr(4), intPtr(5)},
		[]*int{signal.Total, signal.Unknown, signal.Low, signal.Medium, signal.High, signal.Critical})
}

func TestParseAwsBuildLogMissingGroupsStayNull(t *testing.T) {
	t.Run("pattern without groups", func(t *testing.T) {
		patterns := testPatterns(t, `Total: \d+`, "", "")
		result := parseAwsBuildLog(testLogLines("Total: 4 (HIGH: 4)"), patterns, false)
		require.Len(t, result.Signals, 1)
		signal := result.Signals[0]
		require.Nil(t, signal.Total)
		require.Nil(t, signal.High)
		require.Nil(t, signal.Critical)
		require.Equal(t, 1, result.Counts[models.AwsLogPatternTrivy])
	})
	t.Run("only the total group", func(t *testing.T) {
		patterns := testPatterns(t, `Total: (\d+)`, "", "")
		signal := parseAwsBuildLog(testLogLines("Total: 4 (HIGH: 4)"), patterns, false).Signals[0]
		require.Equal(t, 4, *signal.Total)
		require.Nil(t, signal.High)
	})
	t.Run("a total that is not a number", func(t *testing.T) {
		patterns := testPatterns(t, `Total: (\w+)`, "", "")
		require.Nil(t, parseAwsBuildLog(testLogLines("Total: many"), patterns, false).Signals[0].Total)
	})
}

func TestParseAwsBuildLogDeploymentBuild(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, testSmokePattern, testRollbackPattern)
	result := parseAwsBuildLog(testLogLines(syntheticBuildLog), patterns, true)
	smoke := signalsOfType(result, models.AwsLogPatternSmokeTest)
	require.Len(t, smoke, 2)
	require.Equal(t, "passed", smoke[0].Result)
	require.Equal(t, "failed", smoke[1].Result)
	require.Equal(t, testLogTime, smoke[0].LoggedAt)
	require.Len(t, signalsOfType(result, models.AwsLogPatternRollback), 2)
	require.Equal(t, map[models.AwsLogPatternName]int{
		models.AwsLogPatternTrivy: 2, models.AwsLogPatternSmokeTest: 2, models.AwsLogPatternRollback: 2,
	}, result.Counts)
}

func TestParseAwsBuildLogNonDeploymentBuildHasNoSmokeOrRollback(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, testSmokePattern, testRollbackPattern)
	result := parseAwsBuildLog(testLogLines(syntheticBuildLog), patterns, false)
	require.Empty(t, signalsOfType(result, models.AwsLogPatternSmokeTest))
	require.Empty(t, signalsOfType(result, models.AwsLogPatternRollback))
	require.NotContains(t, result.Counts, models.AwsLogPatternSmokeTest)
	require.NotContains(t, result.Counts, models.AwsLogPatternRollback)
}

func TestParseAwsBuildLogPatternWithoutMatchesCountsZero(t *testing.T) {
	patterns := testPatterns(t, testTrivyPattern, testSmokePattern, testRollbackPattern)
	result := parseAwsBuildLog(testLogLines("compiling\nall good"), patterns, true)
	require.Empty(t, result.Signals)
	require.Equal(t, map[models.AwsLogPatternName]int{
		models.AwsLogPatternTrivy: 0, models.AwsLogPatternSmokeTest: 0, models.AwsLogPatternRollback: 0,
	}, result.Counts)
}

func TestParseAwsBuildLogSmokePatternWithoutGroupHasNoResult(t *testing.T) {
	patterns := testPatterns(t, "", `(?i)smoke test`, "")
	result := parseAwsBuildLog(testLogLines("INFO: Smoke test passed"), patterns, true)
	require.Len(t, result.Signals, 1)
	require.Equal(t, "", result.Signals[0].Result)
}

func TestParseAwsBuildLogUnsetPatternsAreNotCounted(t *testing.T) {
	result := parseAwsBuildLog(testLogLines(syntheticBuildLog), testPatterns(t, "", testSmokePattern, ""), false)
	require.Empty(t, result.Signals)
	require.Empty(t, result.Counts)
}

func TestCompileAwsLogPatternsNamesTheBrokenField(t *testing.T) {
	tests := []struct {
		field  string
		config models.AwsScopeConfig
	}{
		{awsFieldTrivyPattern, models.AwsScopeConfig{TrivyTotalsPattern: "("}},
		{awsFieldSmokeTestPattern, models.AwsScopeConfig{SmokeTestPattern: "("}},
		{awsFieldRollbackPattern, models.AwsScopeConfig{RollbackPattern: "("}},
	}
	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			_, err := compileAwsLogPatterns(&tt.config)
			require.NotNil(t, err)
			require.Contains(t, err.Error(), tt.field)
		})
	}
	patterns, err := compileAwsLogPatterns(&models.AwsScopeConfig{})
	require.Nil(t, err)
	require.False(t, patterns.anySet())
}

func TestAwsLogLinesSplitMessagesAndKeepTheEventTime(t *testing.T) {
	lines := awsLogLines([]AwsLogEvent{
		{Timestamp: testLogTime.UnixMilli(), Message: "first\r\nsecond\n"},
		{Timestamp: testLogTime.Add(time.Second).UnixMilli(), Message: "third"},
	})
	require.Equal(t, []awsLogLine{
		{"first", testLogTime}, {"second", testLogTime}, {"third", testLogTime.Add(time.Second)},
	}, lines)
}

func TestParseAwsBuildLogTrivyTargetFromEventsEndingInNewlines(t *testing.T) {
	var events []AwsLogEvent
	for _, line := range []string{"", "acme-image (debian)", "=====", "Total: 1 (LOW: 1)"} {
		events = append(events, AwsLogEvent{Timestamp: testLogTime.UnixMilli(), Message: line + "\n"})
	}
	result := parseAwsBuildLog(awsLogLines(events), testPatterns(t, testTrivyPattern, "", ""), false)
	require.Len(t, result.Signals, 1)
	require.Equal(t, "acme-image (debian)", result.Signals[0].Target)
}
