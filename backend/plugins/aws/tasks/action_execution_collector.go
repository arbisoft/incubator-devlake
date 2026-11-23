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
	"reflect"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = CollectActionExecutions

var CollectActionExecutionsMeta = plugin.SubTaskMeta{
	Name:             "collectActionExecutions",
	EntryPoint:       CollectActionExecutions,
	EnabledByDefault: true,
	Description:      "collect AWS CodePipeline action executions",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

const executionsNeedingActionsClause = `connection_id = ? AND pipeline_arn = ? AND (
	status IN ?
	OR NOT EXISTS (SELECT 1 FROM _tool_aws_action_executions a WHERE a.connection_id = _tool_aws_pipeline_executions.connection_id AND a.execution_id = _tool_aws_pipeline_executions.execution_id)
	OR EXISTS (SELECT 1 FROM _tool_aws_action_executions a WHERE a.connection_id = _tool_aws_pipeline_executions.connection_id AND a.execution_id = _tool_aws_pipeline_executions.execution_id AND a.status = ?)
	OR last_update_time >= ?
)`

// ExecutionsNeedingActionsCursor lists the runs whose actions must be collected; without a since time every run of the scope qualifies.
func ExecutionsNeedingActionsCursor(db dal.Dal, data *AwsTaskData, since *time.Time) (dal.Rows, errors.Error) {
	clause := executionsNeedingActionsClause
	args := []interface{}{data.Options.ConnectionId, data.Options.ScopeId, models.AwsUnfinishedExecutionStatuses, string(models.AwsActionInProgress), since}
	if since == nil {
		clause = "connection_id = ? AND pipeline_arn = ?"
		args = args[:2]
	}
	cursor, err := db.Cursor(
		dal.Select("execution_id"),
		dal.From(&models.AwsPipelineExecution{}),
		dal.Where(clause, args...),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "list the executions to collect actions for")
	}
	return cursor, nil
}

func CollectActionExecutions(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_ACTION_EXECUTION_TABLE)
	collector, err := api.NewStatefulApiCollector(*raw)
	if err != nil {
		return err
	}
	db := taskCtx.GetDal()
	cursor, err := ExecutionsNeedingActionsCursor(db, data, collector.GetSince())
	if err != nil {
		return err
	}
	input, err := api.NewDalCursorIterator(db, cursor, reflect.TypeOf(models.AwsPipelineExecution{}))
	if err != nil {
		return err
	}
	args := awsCollectorArgs(taskCtx.GetLogger(), awsCollectorSpec{
		Client: data.CodePipelineClient,
		Action: models.AwsActionListActionExecutions,
		Input:  input,
		Paged:  true,
		Request: func(input interface{}, nextToken string) interface{} {
			return AwsListActionExecutionsInput{
				PipelineName: data.Scope.Name,
				Filter:       AwsActionExecutionFilter{PipelineExecutionId: input.(*models.AwsPipelineExecution).ExecutionId},
				MaxResults:   awsCollectorPageSize,
				NextToken:    nextToken,
			}
		},
		Parse: parseActionExecutions,
	})
	args.Incremental = true
	args.PreserveRawData = true // AWS expires run history, so a full sync keeps the runs it no longer returns
	if err = collector.InitCollector(args); err != nil {
		return err
	}
	return collector.Execute()
}

func parseActionExecutions(res *http.Response) ([]json.RawMessage, errors.Error) {
	return parseAwsItems(res, awsListKeyActionExecutions)
}
