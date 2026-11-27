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
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	coreModels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/core/runner"
	"github.com/apache/incubator-devlake/helpers/e2ehelper"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/plugins/aws/impl"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/apache/incubator-devlake/plugins/aws/tasks"
	"github.com/stretchr/testify/require"
)

const (
	deployBuild        = "acme-prod-deploy:00000003-1111-4111-8111-000000000000"
	deployBuildOther   = "acme-prod-deploy:00000007-1111-4111-8111-000000000000"
	checksBuild        = "acme-ci-tests:00000008-1111-4111-8111-000000000000"
	buildWithoutAnyLog = "acme-prod-build:00000001-1111-4111-8111-000000000000"
)

const (
	trivyPattern    = `Total: (\d+) \((.*)\)`
	smokePattern    = `(?i)smoke test (passed|failed)`
	rollbackPattern = `(?i)(rolling .* back|rolled back|rollback)`
)

const deployLog = `[Container] 2026/11/20 13:20:01.123456 Running command echo "INFO: Smoke test passed with HTTP ${status} on attempt ${i}"
111122223333.dkr.ecr.us-east-2.amazonaws.com/acme-backend:v1.2.3 (debian 12.15)
===============================================================================
Total: 102 (HIGH: 100, CRITICAL: 2)

Python (python-pkg)
===================
Total: 77 (HIGH: 69, CRITICAL: 8)
│ example-lib │ CVE-2026-0001 │ HIGH │ fixed │ 1.0 │ 1.1 │ rollback of state in example-lib allows ... │
INFO: Smoke test passed with HTTP 200 on attempt 1
FATAL: Smoke test failed after 5 attempts. Rolling 'acme-backend' back to acme-backend-task:41`

const checksLog = "acme-image (debian 12)\n==========\nTotal: 3 (LOW: 3)"

// logsStub serves CloudWatch Logs GetLogEvents from memory; a stream without a log answers ResourceNotFoundException.
type logsStub struct {
	logs     map[string]string
	status   int
	errType  string
	requests int
}

func (s *logsStub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.requests++
	var input tasks.AwsGetLogEventsInput
	_ = json.NewDecoder(r.Body).Decode(&input)
	w.Header().Set("Content-Type", "application/x-amz-json-1.1")
	text, found := s.logs[input.LogStreamName]
	switch {
	case s.errType != "":
		w.WriteHeader(s.status)
		_ = json.NewEncoder(w).Encode(map[string]string{"__type": s.errType, "message": "stub"})
	case !found:
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"__type": "ResourceNotFoundException", "message": "stub"})
	case input.NextToken == "":
		_ = json.NewEncoder(w).Encode(tasks.AwsGetLogEventsOutput{
			Events:           []tasks.AwsLogEvent{{Timestamp: time.Date(2026, 11, 20, 13, 20, 0, 0, time.UTC).UnixMilli(), Message: text}},
			NextForwardToken: "f/1",
		})
	default:
		_ = json.NewEncoder(w).Encode(tasks.AwsGetLogEventsOutput{NextForwardToken: input.NextToken})
	}
}

func streamOf(buildId string) string {
	_, id, _ := strings.Cut(buildId, ":")
	return "release/" + id
}

func newStubClient(t *testing.T, tester *e2ehelper.DataFlowTester, handler http.Handler) *api.ApiClient {
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client, err := api.NewApiClient(context.Background(), server.URL+"/", nil, 0, "", runner.CreateBasicRes(tester.Cfg, tester.Log, tester.Db))
	require.Nil(t, err)
	client.SetAfterFunction(api.NewAwsAfterResponse(func(time.Duration) {}))
	return client
}

func newLogsData(t *testing.T, tester *e2ehelper.DataFlowTester, scopeId string, stub *logsStub, config *models.AwsScopeConfig) *tasks.AwsTaskData {
	data := newTaskData(t, tester, scopeId)
	data.Options.ScopeConfig = config
	data.LogsClient = newStubClient(t, tester, stub)
	return data
}

// newLogsScopes returns the task data of both scopes, reading logs from the same stub.
func newLogsScopes(t *testing.T, tester *e2ehelper.DataFlowTester, stub *logsStub, config *models.AwsScopeConfig) []*tasks.AwsTaskData {
	return []*tasks.AwsTaskData{
		newLogsData(t, tester, deployPipelineArn, stub, config),
		newLogsData(t, tester, checksPipelineArn, stub, config),
	}
}

func collectLogSignals(tester *e2ehelper.DataFlowTester, scopes []*tasks.AwsTaskData) {
	for _, data := range scopes {
		tester.Subtask(tasks.CollectBuildLogSignalsMeta, data)
	}
}

func allPatterns() *models.AwsScopeConfig {
	return &models.AwsScopeConfig{TrivyTotalsPattern: trivyPattern, SmokeTestPattern: smokePattern, RollbackPattern: rollbackPattern}
}

func importLogFixtures(tester *e2ehelper.DataFlowTester) {
	importCostFixtures(tester)
	tester.FlushTabler(&models.AwsBuildLogSignal{})
	tester.FlushTabler(&models.AwsBuildLogPatternMatch{})
}

func normalRunContext(tester *e2ehelper.DataFlowTester, data *tasks.AwsTaskData) plugin.SubTaskContext {
	return contextimpl.NewStandaloneSubTaskContext(
		context.Background(), runner.CreateBasicRes(tester.Cfg, tester.Log, tester.Db), tester.Name, data, tester.Name, &coreModels.SyncPolicy{},
	)
}

func signalCounts(t *testing.T, tester *e2ehelper.DataFlowTester, buildId string) map[string]int {
	var signals []models.AwsBuildLogSignal
	require.Nil(t, tester.Dal.All(&signals, dal.Where("connection_id = ? AND build_id = ?", 1, buildId)))
	counts := map[string]int{}
	for _, signal := range signals {
		counts[signal.SignalType]++
	}
	return counts
}

// matchCounts maps each pattern name of a build to its count, with -1 standing for NULL.
func matchCounts(t *testing.T, tester *e2ehelper.DataFlowTester, buildId string) map[string]int {
	var matches []models.AwsBuildLogPatternMatch
	require.Nil(t, tester.Dal.All(&matches, dal.Where("connection_id = ? AND build_id = ?", 1, buildId)))
	counts := map[string]int{}
	for _, match := range matches {
		counts[match.PatternName] = -1
		if match.MatchCount != nil {
			counts[match.PatternName] = *match.MatchCount
		}
	}
	return counts
}

func TestBuildLogSignalsReplaceAvailableLogsAndKeepUnavailableOnes(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)
	importLogFixtures(tester)
	stub := &logsStub{logs: map[string]string{streamOf(deployBuild): deployLog, streamOf(checksBuild): checksLog}}
	scopes := newLogsScopes(t, tester, stub, allPatterns())

	t.Run("first run stores signals of available logs and NULL counts for the others", func(t *testing.T) {
		collectLogSignals(tester, scopes)
		require.Equal(t, map[string]int{"TRIVY": 2, "SMOKE_TEST": 2, "ROLLBACK": 2}, signalCounts(t, tester, deployBuild))
		require.Equal(t, map[string]int{"TRIVY": 2, "SMOKE_TEST": 2, "ROLLBACK": 2}, matchCounts(t, tester, deployBuild))
		require.Equal(t, map[string]int{"TRIVY": 1}, signalCounts(t, tester, checksBuild))
		require.Equal(t, map[string]int{"TRIVY": 1}, matchCounts(t, tester, checksBuild))
		require.Equal(t, map[string]int{"TRIVY": -1, "SMOKE_TEST": -1, "ROLLBACK": -1}, matchCounts(t, tester, deployBuildOther))
		require.Empty(t, signalCounts(t, tester, deployBuildOther))
		require.Equal(t, map[string]int{"TRIVY": -1}, matchCounts(t, tester, buildWithoutAnyLog))

		var signal models.AwsBuildLogSignal
		require.Nil(t, tester.Dal.First(&signal, dal.Where("build_id = ? AND signal_type = ? AND seq = ?", deployBuild, "TRIVY", 2)))
		require.Equal(t, "Python (python-pkg)", signal.Target)
		require.Equal(t, 77, *signal.Total)
		require.Equal(t, 69, *signal.High)
		require.Equal(t, 8, *signal.Critical)
		require.Nil(t, signal.Low)
		require.Equal(t, time.Date(2026, 11, 20, 13, 20, 0, 0, time.UTC), signal.LoggedAt.UTC())
		var smoke models.AwsBuildLogSignal
		require.Nil(t, tester.Dal.First(&smoke, dal.Where("build_id = ? AND signal_type = ? AND seq = ?", deployBuild, "SMOKE_TEST", 2)))
		require.Equal(t, "failed", smoke.Result)
		var match models.AwsBuildLogPatternMatch
		require.Nil(t, tester.Dal.First(&match, dal.Where("build_id = ? AND pattern_name = ?", deployBuild, "ROLLBACK")))
		require.Equal(t, rollbackPattern, match.Pattern)
	})

	t.Run("a normal run reads no build that already has pattern rows", func(t *testing.T) {
		before := stub.requests
		for _, data := range scopes {
			require.Nil(t, tasks.CollectBuildLogSignals(normalRunContext(tester, data)))
		}
		require.Equal(t, before, stub.requests)
	})

	t.Run("a full sync replaces available logs and keeps results when the log is gone", func(t *testing.T) {
		delete(stub.logs, streamOf(deployBuild))
		stub.logs[streamOf(deployBuildOther)] = "INFO: Smoke test failed after 3 attempts"
		stub.logs[streamOf(checksBuild)] = "all good"
		collectLogSignals(tester, scopes)

		require.Equal(t, map[string]int{"TRIVY": 2, "SMOKE_TEST": 2, "ROLLBACK": 2}, signalCounts(t, tester, deployBuild))
		require.Equal(t, map[string]int{"TRIVY": 2, "SMOKE_TEST": 2, "ROLLBACK": 2}, matchCounts(t, tester, deployBuild))

		require.Equal(t, map[string]int{"SMOKE_TEST": 1}, signalCounts(t, tester, deployBuildOther))
		require.Equal(t, map[string]int{"TRIVY": 0, "SMOKE_TEST": 1, "ROLLBACK": 0}, matchCounts(t, tester, deployBuildOther))

		require.Empty(t, signalCounts(t, tester, checksBuild))
		require.Equal(t, map[string]int{"TRIVY": 0}, matchCounts(t, tester, checksBuild))

		require.Equal(t, map[string]int{"TRIVY": -1}, matchCounts(t, tester, buildWithoutAnyLog))
	})
}

func TestBuildLogSignalsAreOffWithoutPatterns(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)
	importLogFixtures(tester)
	stub := &logsStub{logs: map[string]string{streamOf(deployBuild): deployLog}}
	collectLogSignals(tester, newLogsScopes(t, tester, stub, &models.AwsScopeConfig{}))
	require.Zero(t, stub.requests)
	require.Empty(t, matchCounts(t, tester, deployBuild))
}

func TestBuildLogSignalsOnlyApplyDeploymentPatternsToDeploymentBuilds(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)

	importLogFixtures(tester)
	stub := &logsStub{logs: map[string]string{streamOf(checksBuild): deployLog}}
	collectLogSignals(tester, newLogsScopes(t, tester, stub, allPatterns()))
	require.Equal(t, map[string]int{"TRIVY": 2}, signalCounts(t, tester, checksBuild))
	require.Equal(t, map[string]int{"TRIVY": 2}, matchCounts(t, tester, checksBuild))

	importLogFixtures(tester)
	stub = &logsStub{logs: map[string]string{streamOf(checksBuild): deployLog}}
	collectLogSignals(tester, newLogsScopes(t, tester, stub, &models.AwsScopeConfig{SmokeTestPattern: smokePattern}))
	require.Equal(t, 2, stub.requests, "only the two deployment builds are read")
	require.Empty(t, matchCounts(t, tester, checksBuild))
}

func TestBuildLogSignalsFailOnABrokenPatternAndStopWhenDenied(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)
	importLogFixtures(tester)

	stub := &logsStub{}
	err := tasks.CollectBuildLogSignals(tester.SubtaskContext(newLogsData(t, tester, deployPipelineArn, stub, &models.AwsScopeConfig{SmokeTestPattern: "("})))
	require.NotNil(t, err)
	require.Contains(t, err.Error(), "smokeTestPattern")
	require.Zero(t, stub.requests)

	denied := &logsStub{status: http.StatusForbidden, errType: "AccessDeniedException"}
	require.Nil(t, tasks.CollectBuildLogSignals(tester.SubtaskContext(newLogsData(t, tester, deployPipelineArn, denied, allPatterns()))))
	require.Equal(t, 1, denied.requests)
	require.Empty(t, matchCounts(t, tester, deployBuild))

	broken := &logsStub{status: http.StatusInternalServerError, errType: "InternalFailure"}
	err = tasks.CollectBuildLogSignals(tester.SubtaskContext(newLogsData(t, tester, deployPipelineArn, broken, allPatterns())))
	require.NotNil(t, err)
	require.Contains(t, err.Error(), "acme-")
}
