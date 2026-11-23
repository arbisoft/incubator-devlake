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
	"reflect"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/devops"
	"github.com/apache/incubator-devlake/core/models/domainlayer/didgen"
	"github.com/apache/incubator-devlake/core/plugin"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = ConvertExecutions

var ConvertExecutionsMeta = plugin.SubTaskMeta{
	Name:             "convertExecutions",
	EntryPoint:       ConvertExecutions,
	EnabledByDefault: true,
	Description:      "convert AWS CodePipeline executions into CI/CD pipelines",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

// isDeploymentAction reports whether the stage or action name matches the deployment pattern.
func isDeploymentAction(enricher *helper.RegexEnricher, stageName, actionName string) bool {
	return enricher.ReturnNameIfMatched(devops.DEPLOYMENT, stageName, actionName) != ""
}

// hasDeploymentAction reports whether a stage or action of the pipeline matches the deployment pattern.
func hasDeploymentAction(db dal.Dal, data *AwsTaskData) (bool, errors.Error) {
	var actions []models.AwsPipelineAction
	err := db.All(&actions, dal.Where("connection_id = ? AND pipeline_arn = ?", data.Options.ConnectionId, data.Options.ScopeId))
	if err != nil {
		return false, errors.Default.Wrap(err, "load the pipeline actions")
	}
	for _, action := range actions {
		if isDeploymentAction(data.RegexEnricher, action.StageName, action.ActionName) {
			return true, nil
		}
	}
	return false, nil
}

// firstCommitMessages maps each run of the scope to the commit message of its first source revision.
func firstCommitMessages(db dal.Dal, data *AwsTaskData) (map[string]string, errors.Error) {
	var revisions []models.AwsExecutionSourceRevision
	err := db.All(
		&revisions,
		dal.Select("r.execution_id, r.commit_message"),
		dal.From("_tool_aws_execution_source_revisions r"),
		dal.Join("JOIN _tool_aws_pipeline_executions e ON e.connection_id = r.connection_id AND e.execution_id = r.execution_id"),
		dal.Where("e.connection_id = ? AND e.pipeline_arn = ?", data.Options.ConnectionId, data.Options.ScopeId),
		dal.Orderby("r.action_name"),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "load the source revisions")
	}
	messages := make(map[string]string, len(revisions))
	for _, revision := range revisions {
		if _, seen := messages[revision.ExecutionId]; !seen {
			messages[revision.ExecutionId] = revision.CommitMessage
		}
	}
	return messages, nil
}

func ConvertExecutions(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_EXECUTION_TABLE)
	db := taskCtx.GetDal()
	deploymentPipeline, err := hasDeploymentAction(db, data)
	if err != nil {
		return err
	}
	commitMessages, err := firstCommitMessages(db, data)
	if err != nil {
		return err
	}
	cursor, err := db.Cursor(
		dal.From(&models.AwsPipelineExecution{}),
		dal.Where("connection_id = ? AND pipeline_arn = ?", data.Options.ConnectionId, data.Options.ScopeId),
	)
	if err != nil {
		return err
	}
	defer cursor.Close()
	executionIdGen := didgen.NewDomainIdGenerator(&models.AwsPipelineExecution{})
	scopeId := models.NewAwsCicdScope(data.Options.ConnectionId, data.Scope).Id
	environment := data.RegexEnricher.ReturnNameIfOmittedOrMatched(devops.PRODUCTION, data.Scope.Name)
	converter, err := helper.NewDataConverter(helper.DataConverterArgs{
		RawDataSubTaskArgs: *raw,
		InputRowType:       reflect.TypeOf(models.AwsPipelineExecution{}),
		Input:              cursor,
		Convert: func(inputRow interface{}) ([]interface{}, errors.Error) {
			execution := inputRow.(*models.AwsPipelineExecution)
			status := cicdStatusOf(awsExecutionStatuses, execution.Status)
			dates, durationSec := awsTaskDates(execution.StartTime, execution.LastUpdateTime, status)
			displayTitle := execution.TriggerTagName
			if displayTitle == "" {
				displayTitle = commitMessages[execution.ExecutionId]
			}
			pipelineType := ""
			if deploymentPipeline && execution.ExecutionType != string(models.AwsExecutionTypeRollback) {
				pipelineType = devops.DEPLOYMENT
			}
			return []interface{}{&devops.CICDPipeline{
				DomainEntity:   domainlayer.DomainEntity{Id: executionIdGen.Generate(execution.ConnectionId, execution.ExecutionId)},
				Name:           data.Scope.Name,
				DisplayTitle:   displayTitle,
				Url:            models.AwsExecutionConsoleUrl(data.Scope.Region, data.Scope.Name, execution.ExecutionId),
				Result:         status.Result,
				Status:         status.Status,
				OriginalStatus: execution.Status,
				Type:           pipelineType,
				DurationSec:    durationSec,
				Environment:    environment,
				TaskDatesInfo:  dates,
				CicdScopeId:    scopeId,
			}}, nil
		},
	})
	if err != nil {
		return err
	}
	return converter.Execute()
}
