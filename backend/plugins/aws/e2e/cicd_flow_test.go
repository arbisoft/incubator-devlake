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
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/code"
	"github.com/apache/incubator-devlake/core/models/domainlayer/devops"
	"github.com/apache/incubator-devlake/helpers/e2ehelper"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/impl"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/apache/incubator-devlake/plugins/aws/tasks"
	"github.com/stretchr/testify/require"
)

const (
	deployPipelineArn = "arn:aws:codepipeline:us-east-2:111122223333:acme-prod-backend-pipeline"
	checksPipelineArn = "arn:aws:codepipeline:us-east-2:111122223333:acme-ci-checks-pipeline"
)

var rawTables = []string{
	tasks.RAW_PIPELINE_DEFINITION_TABLE,
	tasks.RAW_EXECUTION_TABLE,
	tasks.RAW_ACTION_EXECUTION_TABLE,
	tasks.RAW_PROJECT_TABLE,
	tasks.RAW_BUILD_TABLE,
}

var toolTables = []dal.Tabler{
	&models.AwsPipelineAction{},
	&models.AwsPipelineExecution{},
	&models.AwsExecutionSourceRevision{},
	&models.AwsActionExecution{},
	&models.AwsCodebuildProject{},
	&models.AwsCodebuildBuild{},
	&models.AwsCodebuildBuildPhase{},
}

var domainTables = []dal.Tabler{
	&devops.CicdScope{},
	&devops.CICDPipeline{},
	&devops.CICDTask{},
	&devops.CiCDPipelineCommit{},
}

func newTaskData(t *testing.T, tester *e2ehelper.DataFlowTester, scopeId string) *tasks.AwsTaskData {
	scope := &models.AwsPipeline{}
	require.Nil(t, tester.Dal.First(scope, dal.Where("connection_id = ? AND arn = ?", 1, scopeId)))
	enricher := api.NewRegexEnricher()
	require.Nil(t, enricher.TryAdd(devops.DEPLOYMENT, "(?i)deploy"))
	require.Nil(t, enricher.TryAdd(devops.PRODUCTION, "(?i)prod"))
	return &tasks.AwsTaskData{
		Options:       &tasks.AwsOptions{ConnectionId: 1, ScopeId: scopeId},
		Scope:         scope,
		RegexEnricher: enricher,
	}
}

func verifyTool(tester *e2ehelper.DataFlowTester, tabler dal.Tabler, name string) {
	tester.VerifyTableWithOptions(tabler, e2ehelper.TableOptions{
		CSVRelPath:  "./snapshot_tables/" + name + ".csv",
		IgnoreTypes: []interface{}{common.NoPKModel{}},
	})
}

func verifyDomain(tester *e2ehelper.DataFlowTester, tabler dal.Tabler, name string) {
	tester.VerifyTableWithOptions(tabler, e2ehelper.TableOptions{
		CSVRelPath:  "./snapshot_tables/" + name + ".csv",
		IgnoreTypes: []interface{}{domainlayer.DomainEntity{}, common.NoPKModel{}},
	})
}

func TestAwsCicdFlow(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)

	tester.FlushTabler(&models.AwsPipeline{})
	tester.ImportNullableCsvIntoTabler("./seed_tables/_tool_aws_pipelines.csv", &models.AwsPipeline{})
	tester.FlushTabler(&models.AwsPrice{})
	tester.ImportCsvIntoTabler("./seed_tables/_tool_aws_prices.csv", &models.AwsPrice{})
	tester.FlushTabler(&code.Repo{})
	tester.ImportCsvIntoTabler("./seed_tables/repos.csv", &code.Repo{})
	for _, table := range rawTables {
		tester.ImportCsvIntoRawTable("./raw_tables/_raw_"+table+".csv", "_raw_"+table)
	}
	for _, table := range append(toolTables, domainTables...) {
		tester.FlushTabler(table)
	}

	scopes := []*tasks.AwsTaskData{newTaskData(t, tester, deployPipelineArn), newTaskData(t, tester, checksPipelineArn)}
	for _, data := range scopes {
		tester.Subtask(tasks.ExtractPipelineDefinitionMeta, data)
		tester.Subtask(tasks.ExtractExecutionsMeta, data)
		tester.Subtask(tasks.ExtractActionExecutionsMeta, data)
		tester.Subtask(tasks.ExtractProjectsMeta, data)
		tester.Subtask(tasks.ExtractBuildsMeta, data)
		tester.Subtask(tasks.CalculateCostMeta, data)
	}
	tester.VerifyTableWithOptions(&models.AwsPipeline{}, e2ehelper.TableOptions{
		CSVRelPath:  "./snapshot_tables/_tool_aws_pipelines.csv",
		IgnoreTypes: []interface{}{common.Scope{}},
	})
	verifyTool(tester, &models.AwsPipelineAction{}, "_tool_aws_pipeline_actions")
	verifyTool(tester, &models.AwsPipelineExecution{}, "_tool_aws_pipeline_executions")
	verifyTool(tester, &models.AwsExecutionSourceRevision{}, "_tool_aws_execution_source_revisions")
	verifyTool(tester, &models.AwsActionExecution{}, "_tool_aws_action_executions")
	verifyTool(tester, &models.AwsCodebuildProject{}, "_tool_aws_codebuild_projects")
	verifyTool(tester, &models.AwsCodebuildBuild{}, "_tool_aws_codebuild_builds")
	verifyTool(tester, &models.AwsCodebuildBuildPhase{}, "_tool_aws_codebuild_build_phases")

	for _, data := range scopes {
		tester.Subtask(tasks.ConvertPipelineScopeMeta, data)
		tester.Subtask(tasks.ConvertExecutionsMeta, data)
		tester.Subtask(tasks.ConvertActionExecutionsMeta, data)
		tester.Subtask(tasks.ConvertPipelineCommitsMeta, data)
	}
	tester.VerifyTableWithOptions(&devops.CicdScope{}, e2ehelper.TableOptions{
		CSVRelPath:   "./snapshot_tables/cicd_scopes.csv",
		IgnoreFields: []string{"created_date", "updated_date"},
		IgnoreTypes:  []interface{}{domainlayer.DomainEntity{}, common.NoPKModel{}},
	})
	verifyDomain(tester, &devops.CICDPipeline{}, "cicd_pipelines")
	verifyDomain(tester, &devops.CICDTask{}, "cicd_tasks")
	verifyDomain(tester, &devops.CiCDPipelineCommit{}, "cicd_pipeline_commits")
}

func executionIdsNeedingActions(t *testing.T, tester *e2ehelper.DataFlowTester, since *time.Time) []string {
	cursor, err := tasks.ExecutionsNeedingActionsCursor(tester.Dal, newTaskData(t, tester, deployPipelineArn), since)
	require.Nil(t, err)
	defer cursor.Close()
	var ids []string
	for cursor.Next() {
		var execution models.AwsPipelineExecution
		require.Nil(t, tester.Dal.Fetch(cursor, &execution))
		ids = append(ids, execution.ExecutionId)
	}
	return ids
}

func TestExecutionsNeedingActionsFollowTheirLastUpdate(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)
	tester.ImportCsvIntoTabler("./snapshot_tables/_tool_aws_pipelines.csv", &models.AwsPipeline{})
	tester.ImportCsvIntoTabler("./snapshot_tables/_tool_aws_pipeline_executions.csv", &models.AwsPipelineExecution{})
	tester.ImportCsvIntoTabler("./snapshot_tables/_tool_aws_action_executions.csv", &models.AwsActionExecution{})
	const finishedRun = "aaaaaaaa-0000-4000-8000-000000000001"

	updatedAfter := time.Date(2026, 11, 20, 13, 49, 0, 0, time.UTC)
	require.Contains(t, executionIdsNeedingActions(t, tester, &updatedAfter), finishedRun)

	updatedBefore := time.Date(2026, 11, 20, 13, 51, 0, 0, time.UTC)
	require.NotContains(t, executionIdsNeedingActions(t, tester, &updatedBefore), finishedRun)

	require.Contains(t, executionIdsNeedingActions(t, tester, nil), finishedRun)
}
