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

package api

import (
	"context"
	"errors"
	"testing"
	"time"

	lakeErrors "github.com/apache/incubator-devlake/core/errors"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/apache/incubator-devlake/plugins/aws/tasks"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/smithy-go"
	"github.com/stretchr/testify/require"
)

type stubKey struct{ region, action string }

// awsStub answers every AWS call with a healthy account unless an override says otherwise.
type awsStub struct {
	failures    map[stubKey]lakeErrors.Error
	pipelines   []tasks.AwsPipelineSummary
	runs        int
	hasBuild    bool
	hasLogs     bool
	calls       []stubKey
	costRequest tasks.AwsGetCostAndUsageInput
}

func newAwsStub() *awsStub {
	return &awsStub{
		failures:  map[stubKey]lakeErrors.Error{},
		pipelines: []tasks.AwsPipelineSummary{{Name: "web"}},
		runs:      1,
		hasBuild:  true,
		hasLogs:   true,
	}
}

func awsDenied() lakeErrors.Error {
	return lakeErrors.Forbidden.Wrap(&helper.AwsApiError{StatusCode: 403, Code: "AccessDeniedException", Message: "not allowed"}, "AWS denied access")
}

func (s *awsStub) call(service tasks.AwsService, region, name string, in, out interface{}) lakeErrors.Error {
	action := string(service) + ":" + name
	s.calls = append(s.calls, stubKey{region, action})
	if err, ok := s.failures[stubKey{region, action}]; ok {
		return err
	}
	switch o := out.(type) {
	case *tasks.AwsCallerIdentity:
		o.Account = "123456789012"
	case *tasks.AwsListPipelinesOutput:
		o.Pipelines = s.pipelines
	case *tasks.AwsGetPipelineOutput:
		o.Metadata.PipelineArn = "arn:aws:codepipeline:" + region + ":123456789012:web"
	case *tasks.AwsListPipelineExecutionsOutput:
		for i := 0; i < s.runs; i++ {
			o.PipelineExecutionSummaries = append(o.PipelineExecutionSummaries, struct {
				PipelineExecutionId string `json:"pipelineExecutionId"`
			}{"exec-1"})
		}
	case *tasks.AwsListActionExecutionsOutput:
		detail := tasks.AwsActionExecutionDetail{}
		if s.hasBuild {
			detail.Output.ExecutionResult.ExternalExecutionId = "build:1"
			detail.Input.Configuration.ProjectName = "build"
		}
		o.ActionExecutionDetails = []tasks.AwsActionExecutionDetail{detail}
	case *tasks.AwsBatchGetBuildsOutput:
		o.Builds = make([]struct {
			Logs struct {
				GroupName  string `json:"groupName"`
				StreamName string `json:"streamName"`
			} `json:"logs"`
		}, 1)
		if s.hasLogs {
			o.Builds[0].Logs.GroupName, o.Builds[0].Logs.StreamName = "/aws/codebuild/build", "stream-1"
		}
	}
	if cost, ok := in.(tasks.AwsGetCostAndUsageInput); ok {
		s.costRequest = cost
	}
	return nil
}

func okProvider() aws.CredentialsProvider {
	return aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) { return aws.Credentials{}, nil })
}

func failingProvider(code string) aws.CredentialsProvider {
	return aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) {
		return aws.Credentials{}, errors.Join(errors.New("failed to retrieve credentials"), &smithy.GenericAPIError{Code: code, Message: "aws said no"})
	})
}

func newConn(regions ...string) *models.AwsConn {
	return &models.AwsConn{AuthType: models.AwsAuthTypeAccessKey, Regions: regions}
}

func checkOf(res *AwsTestConnResponse, region, action string) AwsPermissionCheck {
	for _, check := range res.Checks {
		if check.Region == region && check.Action == action {
			return check
		}
	}
	return AwsPermissionCheck{}
}

func TestRunAwsChecks(t *testing.T) {
	awsNow = func() time.Time { return time.Date(2026, 11, 23, 9, 0, 0, 0, time.UTC) }
	defer func() { awsNow = time.Now }()
	listPipelines := models.AwsActionListPipelines

	t.Run("all allowed", func(t *testing.T) {
		res := runAwsChecks(context.Background(), newConn("us-east-1", "us-east-2"), okProvider(), newAwsStub().call)
		require.True(t, res.Success)
		require.Equal(t, "Connected to account 123456789012", res.Message)
		require.Equal(t, "123456789012", res.AccountId)
		require.Empty(t, res.Warnings)
		for _, check := range res.Checks {
			require.Equal(t, AwsCheckAllowed, check.Status, check.Action)
		}
		require.Len(t, res.Checks, 20)
	})

	t.Run("a row carries the description of its permission", func(t *testing.T) {
		res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), newAwsStub().call)
		require.Equal(t, "Lists pipelines for the scope picker.", checkOf(res, "us-east-1", listPipelines).UsedFor)
	})

	t.Run("list pipelines denied in one of two regions", func(t *testing.T) {
		stub := newAwsStub()
		stub.failures[stubKey{"us-east-2", listPipelines}] = awsDenied()
		res := runAwsChecks(context.Background(), newConn("us-east-1", "us-east-2"), okProvider(), stub.call)
		require.False(t, res.Success)
		require.Equal(t, "Check failed: codepipeline:ListPipelines in us-east-2", res.Message)
		require.Equal(t, AwsCheckAllowed, checkOf(res, "us-east-1", models.AwsActionGetPipeline).Status)
		require.Equal(t, AwsCheckDenied, checkOf(res, "us-east-2", listPipelines).Status)
		require.Equal(t, "not allowed", checkOf(res, "us-east-2", listPipelines).Detail)
		require.Equal(t, AwsCheckNotChecked, checkOf(res, "us-east-2", models.AwsActionGetPipeline).Status)
		require.Contains(t, checkOf(res, "us-east-2", models.AwsActionGetPipeline).Detail, "ListPipelines")
	})

	t.Run("no pipelines", func(t *testing.T) {
		stub := newAwsStub()
		stub.pipelines = nil
		res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), stub.call)
		require.True(t, res.Success)
		require.Contains(t, res.Warnings, "Couldn't verify codepipeline:GetPipeline in us-east-1: no pipeline in this region.")
		require.Equal(t, AwsCheckAllowed, checkOf(res, "us-east-1", listPipelines).Status)
		require.Equal(t, AwsCheckAllowed, checkOf(res, "us-east-1", models.AwsActionListProjects).Status)
		require.Equal(t, AwsCheckNotChecked, checkOf(res, "us-east-1", models.AwsActionGetPipeline).Status)
		require.Equal(t, "no pipeline in this region", checkOf(res, "us-east-1", models.AwsActionBatchGetBuilds).Detail)
	})

	t.Run("no run yet", func(t *testing.T) {
		stub := newAwsStub()
		stub.runs = 0
		res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), stub.call)
		require.True(t, res.Success)
		require.Contains(t, res.Warnings, "Couldn't verify codepipeline:ListActionExecutions in us-east-1: no run yet.")
		require.Equal(t, "no run yet", checkOf(res, "us-east-1", models.AwsActionListActionExecutions).Detail)
		require.Equal(t, "no run yet", checkOf(res, "us-east-1", models.AwsActionBatchGetProjects).Detail)
	})

	t.Run("no codebuild action", func(t *testing.T) {
		stub := newAwsStub()
		stub.hasBuild = false
		res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), stub.call)
		require.True(t, res.Success)
		require.Contains(t, res.Warnings, "Couldn't verify codebuild:BatchGetBuilds in us-east-1: no CodeBuild action in the latest run.")
		require.Equal(t, "no CodeBuild action in the latest run", checkOf(res, "us-east-1", models.AwsActionBatchGetBuilds).Detail)
	})

	t.Run("build without log stream", func(t *testing.T) {
		stub := newAwsStub()
		stub.hasLogs = false
		res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), stub.call)
		require.True(t, res.Success)
		require.Equal(t, "build has no log stream", checkOf(res, "us-east-1", models.AwsActionGetLogEvents).Detail)
		require.Equal(t, AwsCheckNotChecked, checkOf(res, "us-east-1", models.AwsActionGetLogEvents).Status)
	})

	t.Run("optional permissions denied only warn", func(t *testing.T) {
		stub := newAwsStub()
		stub.failures[stubKey{"us-east-2", models.AwsActionListTagsForResource}] = awsDenied()
		stub.failures[stubKey{"us-east-2", models.AwsActionGetLogEvents}] = awsDenied()
		res := runAwsChecks(context.Background(), newConn("us-east-2"), okProvider(), stub.call)
		require.True(t, res.Success)
		require.Equal(t, []string{
			"Pipeline tags are off: codepipeline:ListTagsForResource is denied in us-east-2.",
			"Build log signals are off: logs:GetLogEvents is denied in us-east-2.",
		}, res.Warnings)
	})

	t.Run("a failed call that is not a denial is an error row", func(t *testing.T) {
		stub := newAwsStub()
		stub.failures[stubKey{"us-east-1", models.AwsActionListProjects}] = lakeErrors.Default.New("connection reset by peer")
		res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), stub.call)
		require.False(t, res.Success)
		require.Equal(t, AwsCheckError, checkOf(res, "us-east-1", models.AwsActionListProjects).Status)
		require.Equal(t, detailRequestFailed, checkOf(res, "us-east-1", models.AwsActionListProjects).Detail)
	})

	t.Run("a required action failing with a non-denial error fails the test", func(t *testing.T) {
		stub := newAwsStub()
		stub.failures[stubKey{"us-east-1", models.AwsActionListPipelineExecutions}] = lakeErrors.Default.New("connection reset by peer")
		res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), stub.call)
		require.False(t, res.Success)
		require.Equal(t, "Check failed: codepipeline:ListPipelineExecutions in us-east-1", res.Message)
		require.Equal(t, AwsCheckError, checkOf(res, "us-east-1", models.AwsActionListPipelineExecutions).Status)
	})

	t.Run("cost explorer on calls only one action", func(t *testing.T) {
		stub := newAwsStub()
		conn := newConn("us-east-1")
		conn.UseCostExplorer = true
		res := runAwsChecks(context.Background(), conn, okProvider(), stub.call)
		require.True(t, res.Success)
		require.Equal(t, AwsCheckAllowed, checkOf(res, tasks.AwsCostExplorerRegion, models.AwsActionGetCostAndUsage).Status)
		require.Equal(t, AwsCheckNotChecked, checkOf(res, tasks.AwsCostExplorerRegion, models.AwsActionGetCostForecast).Status)
		require.Equal(t, detailNotCalledByTest, checkOf(res, tasks.AwsCostExplorerRegion, models.AwsActionGetTags).Detail)
		require.Equal(t, "2026-11-21", stub.costRequest.TimePeriod.Start)
		require.Equal(t, "2026-11-22", stub.costRequest.TimePeriod.End)
		require.Equal(t, costGranularity, stub.costRequest.Granularity)
		require.Equal(t, []string{costMetric}, stub.costRequest.Metrics)
	})

	t.Run("cost explorer on and denied", func(t *testing.T) {
		stub := newAwsStub()
		stub.failures[stubKey{tasks.AwsCostExplorerRegion, models.AwsActionGetCostAndUsage}] = awsDenied()
		conn := newConn("us-east-1")
		conn.UseCostExplorer = true
		res := runAwsChecks(context.Background(), conn, okProvider(), stub.call)
		require.False(t, res.Success)
		require.Equal(t, "Check failed: ce:GetCostAndUsage in us-east-1", res.Message)
	})

	t.Run("cost explorer off has no ce rows", func(t *testing.T) {
		res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), newAwsStub().call)
		for _, check := range res.Checks {
			require.NotEqual(t, models.AwsRequirementCostExplorer, check.Requirement)
		}
	})
}

func TestRunAwsChecksCredentials(t *testing.T) {
	assumeRole := newConn("us-east-1")
	assumeRole.AuthType = models.AwsAuthTypeAssumeRole

	t.Run("assume-role success adds an allowed row", func(t *testing.T) {
		res := runAwsChecks(context.Background(), assumeRole, okProvider(), newAwsStub().call)
		require.True(t, res.Success)
		require.Equal(t, models.AwsActionAssumeRole, res.Checks[0].Action)
		require.Equal(t, AwsCheckAllowed, res.Checks[0].Status)
	})

	tests := []struct {
		name       string
		code       string
		wantStatus AwsCheckStatus
		wantDetail string
	}{
		{"trust policy", "AccessDenied", AwsCheckDenied, detailAccessDenied},
		{"broker key", "InvalidClientTokenId", AwsCheckError, detailBrokerKeyBad},
		{"anything else", "RegionDisabledException", AwsCheckError, "aws said no"},
	}
	for _, tt := range tests {
		t.Run("assume-role failure: "+tt.name, func(t *testing.T) {
			stub := newAwsStub()
			res := runAwsChecks(context.Background(), assumeRole, failingProvider(tt.code), stub.call)
			require.False(t, res.Success)
			require.Equal(t, "Check failed: sts:AssumeRole", res.Message)
			require.Equal(t, tt.wantStatus, res.Checks[0].Status)
			require.Equal(t, tt.wantDetail, res.Checks[0].Detail)
			require.Empty(t, stub.calls, "nothing is called after the role can't be assumed")
			require.Equal(t, detailCredentialsFailed, checkOf(res, "us-east-1", models.AwsActionListPipelines).Detail)
		})
	}

	staticTests := []struct {
		name, code, wantMessage string
	}{
		{"rejected key", "InvalidClientTokenId", "AWS rejected the access key"},
		{"expired token", "ExpiredToken", "The AWS session token has expired"},
	}
	for _, tt := range staticTests {
		t.Run("static key failure: "+tt.name, func(t *testing.T) {
			stub := newAwsStub()
			stub.failures[stubKey{"us-east-1", models.AwsActionGetCallerIdentity}] = lakeErrors.Unauthorized.Wrap(
				&helper.AwsApiError{StatusCode: 403, Code: tt.code, Message: "bad"}, "AWS rejected the credentials")
			res := runAwsChecks(context.Background(), newConn("us-east-1"), okProvider(), stub.call)
			require.False(t, res.Success)
			require.Equal(t, tt.wantMessage, res.Message)
			require.Len(t, stub.calls, 1)
			require.Equal(t, detailCredentialsFailed, checkOf(res, "us-east-1", models.AwsActionListPipelines).Detail)
		})
	}
}
