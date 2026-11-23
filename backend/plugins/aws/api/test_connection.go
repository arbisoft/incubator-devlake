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
	"fmt"
	"net/http"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/apache/incubator-devlake/plugins/aws/tasks"
	"github.com/apache/incubator-devlake/server/api/shared"
	"github.com/aws/aws-sdk-go-v2/aws"
)

type AwsCheckStatus string

const (
	AwsCheckAllowed    AwsCheckStatus = "allowed"
	AwsCheckDenied     AwsCheckStatus = "denied"
	AwsCheckNotChecked AwsCheckStatus = "not_checked"
	AwsCheckError      AwsCheckStatus = "error"
)

const (
	detailCredentialsFailed = "credentials failed"
	detailNotCalledByTest   = "not called by Test: Cost Explorer bills each request"
	detailRequestFailed     = "the request failed"
	detailAccessDenied      = "the role's trust policy doesn't allow this broker with this External ID, or the broker lacks sts:AssumeRole"
	detailBrokerKeyBad      = "the broker key is wrong or inactive"
	costGranularity         = "MONTHLY"
	costMetric              = "UnblendedCost"
	dateLayout              = "2006-01-02"
	maxResultsOne           = 1
)

type AwsPermissionCheck struct {
	Action      string                          `json:"action"`
	UsedFor     string                          `json:"usedFor"`
	Region      string                          `json:"region,omitempty"`
	Requirement models.AwsPermissionRequirement `json:"requirement"`
	Status      AwsCheckStatus                  `json:"status"`
	Detail      string                          `json:"detail,omitempty"`
}

type AwsTestConnResponse struct {
	shared.ApiBody
	AccountId string               `json:"accountId,omitempty"`
	Checks    []AwsPermissionCheck `json:"checks"`
	Warnings  []string             `json:"warnings,omitempty"`
}

// awsCall performs one AWS action; the action is the name without its service prefix.
type awsCall func(service tasks.AwsService, region, action string, in, out interface{}) errors.Error

var awsNow = time.Now

type awsCheckKey struct{ region, action string }

type awsChecker struct {
	call   awsCall
	checks []AwsPermissionCheck
	index  map[awsCheckKey]int
}

func newAwsChecker(conn *models.AwsConn, call awsCall) *awsChecker {
	c := &awsChecker{call: call, index: map[awsCheckKey]int{}}
	add := func(region string, p models.AwsPermission) {
		c.index[awsCheckKey{region, p.Action}] = len(c.checks)
		c.checks = append(c.checks, AwsPermissionCheck{Action: p.Action, UsedFor: p.UsedFor, Region: region, Requirement: p.Requirement, Status: AwsCheckNotChecked})
	}
	for _, p := range models.AwsPermissions {
		if p.Requirement == models.AwsRequirementAssumeRole && conn.AuthType == models.AwsAuthTypeAssumeRole {
			add("", p)
		}
	}
	for _, region := range conn.Regions {
		for _, p := range models.AwsPermissions {
			if p.Requirement == models.AwsRequirementRequired || p.Requirement == models.AwsRequirementOptional {
				add(region, p)
			}
		}
	}
	for _, p := range models.AwsPermissions {
		if p.Requirement == models.AwsRequirementCostExplorer && conn.UseCostExplorer {
			add(tasks.AwsCostExplorerRegion, p)
		}
	}
	return c
}

func (c *awsChecker) set(region, action string, status AwsCheckStatus, detail string) {
	i := c.index[awsCheckKey{region, action}]
	c.checks[i].Status, c.checks[i].Detail = status, detail
}

func (c *awsChecker) skip(region, detail string, actions ...string) {
	for _, action := range actions {
		c.set(region, action, AwsCheckNotChecked, detail)
	}
}

// skipUnset explains every still-unchecked row that matches.
func (c *awsChecker) skipUnset(detail string, match func(AwsPermissionCheck) bool) {
	for i := range c.checks {
		if c.checks[i].Status == AwsCheckNotChecked && c.checks[i].Detail == "" && match(c.checks[i]) {
			c.checks[i].Detail = detail
		}
	}
}

// probe calls one action, records the outcome and reports whether it was allowed.
func (c *awsChecker) probe(region, action string, in, out interface{}) bool {
	service, name := models.SplitAwsAction(action)
	err := c.call(tasks.AwsService(service), region, name, in, out)
	status, detail := AwsCheckAllowed, ""
	if err != nil {
		status = AwsCheckError
		if err.GetType().GetHttpCode() == http.StatusForbidden {
			status = AwsCheckDenied
		}
		if _, detail = helper.ParseAwsError(err); detail == "" {
			detail = detailRequestFailed
		}
	}
	c.set(region, action, status, detail)
	return status == AwsCheckAllowed
}

func (c *awsChecker) checkRegion(region string) {
	var pipelines tasks.AwsListPipelinesOutput
	if !c.probe(region, models.AwsActionListPipelines, tasks.AwsListPipelinesInput{MaxResults: maxResultsOne}, &pipelines) {
		c.skipUnset("ListPipelines did not succeed in this region", func(check AwsPermissionCheck) bool { return check.Region == region })
		return
	}
	project, buildId, reason := "", "", "no pipeline in this region"
	if len(pipelines.Pipelines) == 0 {
		c.skip(region, reason, models.AwsActionGetPipeline, models.AwsActionListTagsForResource,
			models.AwsActionListPipelineExecutions, models.AwsActionListActionExecutions)
	} else {
		project, buildId, reason = c.checkPipeline(region, pipelines.Pipelines[0].Name)
	}
	c.probe(region, models.AwsActionListProjects, tasks.AwsEmptyInput{}, &tasks.AwsNoOutput{})
	if project == "" {
		c.skip(region, reason, models.AwsActionBatchGetProjects, models.AwsActionListBuildsForProject,
			models.AwsActionBatchGetBuilds, models.AwsActionGetLogEvents)
		return
	}
	c.probe(region, models.AwsActionBatchGetProjects, tasks.AwsBatchGetProjectsInput{Names: []string{project}}, &tasks.AwsNoOutput{})
	c.probe(region, models.AwsActionListBuildsForProject, tasks.AwsListBuildsForProjectInput{ProjectName: project}, &tasks.AwsNoOutput{})
	var builds tasks.AwsBatchGetBuildsOutput
	if !c.probe(region, models.AwsActionBatchGetBuilds, tasks.AwsBatchGetBuildsInput{Ids: []string{buildId}}, &builds) {
		c.skip(region, "BatchGetBuilds did not succeed", models.AwsActionGetLogEvents)
		return
	}
	if len(builds.Builds) == 0 || builds.Builds[0].Logs.StreamName == "" {
		c.skip(region, "build has no log stream", models.AwsActionGetLogEvents)
		return
	}
	logs := builds.Builds[0].Logs
	c.probe(region, models.AwsActionGetLogEvents, tasks.AwsGetLogEventsInput{
		LogGroupName: logs.GroupName, LogStreamName: logs.StreamName, Limit: maxResultsOne, StartFromHead: true,
	}, &tasks.AwsNoOutput{})
}

// checkPipeline probes the CodePipeline actions on one pipeline and returns the build it found, or why there is none.
func (c *awsChecker) checkPipeline(region, name string) (project, buildId, reason string) {
	var got tasks.AwsGetPipelineOutput
	if c.probe(region, models.AwsActionGetPipeline, tasks.AwsGetPipelineInput{Name: name}, &got) {
		c.probe(region, models.AwsActionListTagsForResource, tasks.AwsListTagsInput{ResourceArn: got.Metadata.PipelineArn}, &tasks.AwsNoOutput{})
	} else {
		c.skip(region, "GetPipeline did not succeed", models.AwsActionListTagsForResource)
	}
	var execs tasks.AwsListPipelineExecutionsOutput
	if !c.probe(region, models.AwsActionListPipelineExecutions, tasks.AwsListPipelineExecutionsInput{PipelineName: name, MaxResults: maxResultsOne}, &execs) {
		reason = "ListPipelineExecutions did not succeed"
		c.skip(region, reason, models.AwsActionListActionExecutions)
		return "", "", reason
	}
	if len(execs.PipelineExecutionSummaries) == 0 {
		reason = "no run yet"
		c.skip(region, reason, models.AwsActionListActionExecutions)
		return "", "", reason
	}
	var actions tasks.AwsListActionExecutionsOutput
	input := tasks.AwsListActionExecutionsInput{
		PipelineName: name,
		Filter:       tasks.AwsActionExecutionFilter{PipelineExecutionId: execs.PipelineExecutionSummaries[0].PipelineExecutionId},
	}
	if !c.probe(region, models.AwsActionListActionExecutions, input, &actions) {
		return "", "", "ListActionExecutions did not succeed"
	}
	for _, action := range actions.ActionExecutionDetails {
		buildId, project = action.Output.ExecutionResult.ExternalExecutionId, action.Input.Configuration.ProjectName
		if buildId != "" && project != "" {
			return project, buildId, ""
		}
	}
	return "", "", "no CodeBuild action in the latest run"
}

func (c *awsChecker) checkCostExplorer() {
	yesterday := awsNow().UTC().AddDate(0, 0, -1)
	in := tasks.AwsGetCostAndUsageInput{
		TimePeriod:  tasks.AwsCostTimePeriod{Start: yesterday.AddDate(0, 0, -1).Format(dateLayout), End: yesterday.Format(dateLayout)},
		Granularity: costGranularity,
		Metrics:     []string{costMetric},
	}
	c.probe(tasks.AwsCostExplorerRegion, models.AwsActionGetCostAndUsage, in, &tasks.AwsNoOutput{})
	c.skip(tasks.AwsCostExplorerRegion, detailNotCalledByTest,
		models.AwsActionGetDimensionValues, models.AwsActionGetTags, models.AwsActionGetCostForecast)
}

// checkCredentials returns why the credentials can't be used, or "" and the account they belong to.
func (c *awsChecker) checkCredentials(ctx context.Context, conn *models.AwsConn, provider aws.CredentialsProvider) (accountId, failure string) {
	if conn.AuthType == models.AwsAuthTypeAssumeRole {
		if _, err := provider.Retrieve(ctx); err != nil {
			code, message := helper.ParseAwsError(err)
			status, detail := AwsCheckError, message
			switch {
			case code == helper.AwsErrAccessDenied:
				status, detail = AwsCheckDenied, detailAccessDenied
			case helper.IsAwsCredentialsCode(code):
				detail = detailBrokerKeyBad
			case detail == "":
				detail = detailRequestFailed
			}
			c.set("", models.AwsActionAssumeRole, status, detail)
			return "", firstFailure(c.checks)
		}
		c.set("", models.AwsActionAssumeRole, AwsCheckAllowed, "")
	}
	var identity tasks.AwsCallerIdentity
	_, name := models.SplitAwsAction(models.AwsActionGetCallerIdentity)
	err := c.call(tasks.AwsServiceSts, conn.Regions[0], name, nil, &identity)
	if err == nil {
		return identity.Account, ""
	}
	code, _ := helper.ParseAwsError(err)
	switch {
	case helper.IsAwsExpiredCode(code):
		return "", "The AWS session token has expired"
	case helper.IsAwsCredentialsCode(code):
		return "", "AWS rejected the access key"
	default:
		return "", "Could not reach AWS to verify the credentials"
	}
}

func firstFailure(checks []AwsPermissionCheck) string {
	for _, check := range checks {
		if !check.blocksSuccess() {
			continue
		}
		// The reason leads the message, so the user sees it without reading the table.
		message := "Check failed: " + check.Action
		if check.Region != "" {
			message += " in " + check.Region
		}
		if check.Detail != "" {
			message += ": " + check.Detail
		}
		return message
	}
	return ""
}

func (check AwsPermissionCheck) blocksSuccess() bool {
	failed := check.Status == AwsCheckDenied || check.Status == AwsCheckError
	switch check.Requirement {
	case models.AwsRequirementRequired, models.AwsRequirementAssumeRole:
		return failed
	case models.AwsRequirementCostExplorer:
		return check.Action == models.AwsActionGetCostAndUsage && failed
	default:
		return false
	}
}

func (c *awsChecker) warnings(credentialsFailed bool) []string {
	var warnings []string
	type unverifiedKey struct{ region, detail string }
	unverified := map[unverifiedKey][]string{}
	var unverifiedOrder []unverifiedKey
	for _, check := range c.checks {
		switch {
		case check.Requirement == models.AwsRequirementOptional && check.Status == AwsCheckDenied:
			warnings = append(warnings, fmt.Sprintf("%s: %s is denied in %s.", models.AwsOptionalFeatures[check.Action], check.Action, check.Region))
		case !credentialsFailed && check.Requirement == models.AwsRequirementRequired && check.Status == AwsCheckNotChecked && check.Detail != "":
			key := unverifiedKey{check.Region, check.Detail}
			if _, seen := unverified[key]; !seen {
				unverifiedOrder = append(unverifiedOrder, key)
			}
			unverified[key] = append(unverified[key], check.Action)
		}
	}
	// One line per region and cause, since a failed first call leaves every later check of that region unverified.
	for _, key := range unverifiedOrder {
		actions := unverified[key]
		if len(actions) == 1 {
			warnings = append(warnings, fmt.Sprintf("Couldn't verify %s in %s: %s.", actions[0], key.region, key.detail))
			continue
		}
		warnings = append(warnings, fmt.Sprintf("Couldn't verify %d permissions in %s: %s.", len(actions), key.region, key.detail))
	}
	return warnings
}

// runAwsChecks walks the permission catalog against AWS and reports one row per check.
func runAwsChecks(ctx context.Context, conn *models.AwsConn, provider aws.CredentialsProvider, call awsCall) *AwsTestConnResponse {
	c := newAwsChecker(conn, call)
	res := &AwsTestConnResponse{}
	var failure string
	res.AccountId, failure = c.checkCredentials(ctx, conn, provider)
	credentialsFailed := failure != ""
	if credentialsFailed {
		c.skipUnset(detailCredentialsFailed, func(AwsPermissionCheck) bool { return true })
	} else {
		for _, region := range conn.Regions {
			c.checkRegion(region)
		}
		if conn.UseCostExplorer {
			c.checkCostExplorer()
		}
		failure = firstFailure(c.checks)
	}
	res.Checks = c.checks
	res.Warnings = c.warnings(credentialsFailed)
	res.Success = failure == ""
	res.Message = failure
	if res.Success {
		res.Message = "Connected to account " + res.AccountId
	}
	return res
}

type awsClientKey struct {
	service tasks.AwsService
	region  string
}

// newAwsCaller returns a call function backed by one signing client per service and region.
func newAwsCaller(ctx context.Context, provider aws.CredentialsProvider) awsCall {
	clients := map[awsClientKey]*helper.ApiClient{}
	return func(service tasks.AwsService, region, action string, in, out interface{}) errors.Error {
		if service == tasks.AwsServiceSts {
			identity, err := tasks.GetAwsCallerIdentity(ctx, basicRes, provider, region)
			if err != nil {
				return err
			}
			*out.(*tasks.AwsCallerIdentity) = *identity
			return nil
		}
		key := awsClientKey{service, region}
		client, ok := clients[key]
		if !ok {
			var err errors.Error
			if client, err = tasks.NewAwsApiClient(ctx, basicRes, provider, service, region); err != nil {
				return err
			}
			clients[key] = client
		}
		return tasks.PostAwsJson(client, service, action, in, out)
	}
}

func testConnection(ctx context.Context, connection *models.AwsConnection) (*AwsTestConnResponse, errors.Error) {
	if err := connection.Validate(); err != nil {
		return nil, err
	}
	provider, err := connection.NewCredentialsProvider()
	if err != nil {
		return nil, err
	}
	return runAwsChecks(ctx, &connection.AwsConn, provider, newAwsCaller(ctx, provider)), nil
}

// TestConnection test aws connection
// @Summary test aws connection
// @Description Test aws Connection; the checks are returned with HTTP 200 whether they pass or fail
// @Tags plugins/aws
// @Param body body models.AwsConnection true "json body"
// @Success 200  {object} AwsTestConnResponse "Success"
// @Failure 400  {string} errcode.Error "Bad Request"
// @Failure 500  {string} errcode.Error "Internal Error"
// @Router /plugins/aws/test [POST]
func TestConnection(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	connection := &models.AwsConnection{}
	if err := helper.DecodeMapStruct(input.Body, connection, false); err != nil {
		return nil, plugin.WrapTestConnectionErrResp(basicRes, err)
	}
	if connection.AuthType == models.AwsAuthTypeAssumeRole {
		err := errors.BadInput.New("Save the connection first: the External ID is created when it's saved.")
		return nil, plugin.WrapTestConnectionErrResp(basicRes, err)
	}
	result, err := testConnection(context.TODO(), connection)
	if err != nil {
		return nil, plugin.WrapTestConnectionErrResp(basicRes, err)
	}
	return &plugin.ApiResourceOutput{Body: result, Status: http.StatusOK}, nil
}

// TestExistingConnection test aws connection
// @Summary test aws connection
// @Description Test aws Connection; the checks are returned with HTTP 200 whether they pass or fail
// @Tags plugins/aws
// @Param connectionId path int true "connection ID"
// @Success 200  {object} AwsTestConnResponse "Success"
// @Failure 400  {string} errcode.Error "Bad Request"
// @Failure 500  {string} errcode.Error "Internal Error"
// @Router /plugins/aws/connections/{connectionId}/test [POST]
func TestExistingConnection(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	connection, err := dsHelper.ConnApi.FindByPk(input)
	if err != nil {
		return nil, errors.BadInput.Wrap(err, "find connection from db")
	}
	if err := connection.MergeFromRequest(connection, input.Body); err != nil {
		return nil, plugin.WrapTestConnectionErrResp(basicRes, errors.Convert(err))
	}
	if connection.MissingRoleArn() {
		return nil, plugin.WrapTestConnectionErrResp(basicRes, errors.BadInput.New("Enter the role ARN, then test."))
	}
	result, err := testConnection(context.TODO(), connection)
	if err != nil {
		return nil, plugin.WrapTestConnectionErrResp(basicRes, err)
	}
	return &plugin.ApiResourceOutput{Body: result, Status: http.StatusOK}, nil
}
