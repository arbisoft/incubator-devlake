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

var _ plugin.SubTaskEntryPoint = ConvertActionExecutions

var ConvertActionExecutionsMeta = plugin.SubTaskMeta{
	Name:             "convertActionExecutions",
	EntryPoint:       ConvertActionExecutions,
	EnabledByDefault: true,
	Description:      "convert AWS CodePipeline action executions into CI/CD tasks",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

var awsQueuePhases = []string{
	string(models.AwsBuildPhaseSubmitted),
	string(models.AwsBuildPhaseQueued),
	string(models.AwsBuildPhaseProvisioning),
}

type awsBuildQueueDuration struct {
	BuildId string
	Seconds float64
}

// buildQueueDurations maps each collected build of the scope to the seconds it waited before running.
func buildQueueDurations(db dal.Dal, data *AwsTaskData) (map[string]float64, errors.Error) {
	var durations []awsBuildQueueDuration
	err := db.All(
		&durations,
		dal.Select("b.build_id AS build_id, COALESCE(SUM(p.duration_sec), 0) AS seconds"),
		dal.From("_tool_aws_codebuild_builds b"),
		dal.Join("LEFT JOIN _tool_aws_codebuild_build_phases p ON p.connection_id = b.connection_id AND p.build_id = b.build_id AND p.phase_type IN ?", awsQueuePhases),
		dal.Where(
			"b.connection_id = ? AND b.build_id IN (SELECT external_execution_id FROM _tool_aws_action_executions WHERE connection_id = ? AND pipeline_arn = ?)",
			data.Options.ConnectionId, data.Options.ConnectionId, data.Options.ScopeId,
		),
		dal.Groupby("b.build_id"),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "load the build queue durations")
	}
	byBuild := make(map[string]float64, len(durations))
	for _, duration := range durations {
		byBuild[duration.BuildId] = duration.Seconds
	}
	return byBuild, nil
}

// rollbackExecutionIds returns the ids of the scope's rollback runs.
func rollbackExecutionIds(db dal.Dal, data *AwsTaskData) (map[string]bool, errors.Error) {
	var ids []string
	err := db.Pluck(
		"execution_id",
		&ids,
		dal.From(&models.AwsPipelineExecution{}),
		dal.Where("connection_id = ? AND pipeline_arn = ? AND execution_type = ?", data.Options.ConnectionId, data.Options.ScopeId, string(models.AwsExecutionTypeRollback)),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "load the rollback executions")
	}
	rollbacks := make(map[string]bool, len(ids))
	for _, id := range ids {
		rollbacks[id] = true
	}
	return rollbacks, nil
}

func ConvertActionExecutions(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_ACTION_EXECUTION_TABLE)
	db := taskCtx.GetDal()
	queueDurations, err := buildQueueDurations(db, data)
	if err != nil {
		return err
	}
	rollbacks, err := rollbackExecutionIds(db, data)
	if err != nil {
		return err
	}
	cursor, err := db.Cursor(
		dal.From(&models.AwsActionExecution{}),
		dal.Where("connection_id = ? AND pipeline_arn = ?", data.Options.ConnectionId, data.Options.ScopeId),
	)
	if err != nil {
		return err
	}
	defer cursor.Close()
	actionIdGen := didgen.NewDomainIdGenerator(&models.AwsActionExecution{})
	executionIdGen := didgen.NewDomainIdGenerator(&models.AwsPipelineExecution{})
	scopeId := models.NewAwsCicdScope(data.Options.ConnectionId, data.Scope).Id
	environment := data.RegexEnricher.ReturnNameIfOmittedOrMatched(devops.PRODUCTION, data.Scope.Name)
	converter, err := helper.NewDataConverter(helper.DataConverterArgs{
		RawDataSubTaskArgs: *raw,
		InputRowType:       reflect.TypeOf(models.AwsActionExecution{}),
		Input:              cursor,
		Convert: func(inputRow interface{}) ([]interface{}, errors.Error) {
			action := inputRow.(*models.AwsActionExecution)
			status := cicdStatusOf(awsActionStatuses, action.Status)
			dates, durationSec := awsTaskDates(action.StartTime, action.LastUpdateTime, status)
			var queuedDurationSec *float64
			if seconds, found := queueDurations[action.ExternalExecutionId]; found {
				queuedDurationSec = &seconds
			}
			taskType := ""
			if !rollbacks[action.ExecutionId] {
				taskType = data.RegexEnricher.ReturnNameIfMatched(devops.DEPLOYMENT, action.StageName, action.ActionName)
			}
			return []interface{}{&devops.CICDTask{
				DomainEntity:      domainlayer.DomainEntity{Id: actionIdGen.Generate(action.ConnectionId, action.ActionExecutionId)},
				Name:              action.StageName + "/" + action.ActionName,
				PipelineId:        executionIdGen.Generate(action.ConnectionId, action.ExecutionId),
				Result:            status.Result,
				Status:            status.Status,
				OriginalStatus:    action.Status,
				Type:              taskType,
				Environment:       environment,
				DurationSec:       durationSec,
				QueuedDurationSec: queuedDurationSec,
				TaskDatesInfo:     dates,
				CicdScopeId:       scopeId,
			}}, nil
		},
	})
	if err != nil {
		return err
	}
	return converter.Execute()
}
