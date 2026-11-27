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
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = CollectExecutions

var CollectExecutionsMeta = plugin.SubTaskMeta{
	Name:             "collectExecutions",
	EntryPoint:       CollectExecutions,
	EnabledByDefault: true,
	Description:      "collect AWS CodePipeline executions",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

func CollectExecutions(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_EXECUTION_TABLE)
	collector, err := api.NewStatefulApiCollector(*raw)
	if err != nil {
		return err
	}
	oldestUnfinished, err := findOldestUnfinishedExecutionStart(taskCtx.GetDal(), data)
	if err != nil {
		return err
	}
	cutoff := executionCutoff(collector.GetSince(), oldestUnfinished)
	args := awsCollectorArgs(taskCtx.GetLogger(), awsCollectorSpec{
		Client: data.CodePipelineClient,
		Action: models.AwsActionListPipelineExecutions,
		Paged:  true,
		Request: func(_ interface{}, nextToken string) interface{} {
			return AwsListPipelineExecutionsInput{PipelineName: data.Scope.Name, MaxResults: awsCollectorPageSize, NextToken: nextToken}
		},
		Parse: parseExecutionsSince(cutoff),
	})
	args.PreserveRawData = true // AWS expires run history, so a full sync keeps the runs it no longer returns
	if err = collector.InitCollector(args); err != nil {
		return err
	}
	return collector.Execute()
}

// findOldestUnfinishedExecutionStart returns the start of the oldest run of the scope that can still change, or nil.
func findOldestUnfinishedExecutionStart(db dal.Dal, data *AwsTaskData) (*time.Time, errors.Error) {
	var oldest models.AwsPipelineExecution
	err := db.First(
		&oldest,
		dal.Where("connection_id = ? AND pipeline_arn = ? AND status IN ?", data.Options.ConnectionId, data.Options.ScopeId, models.AwsUnfinishedExecutionStatuses),
		dal.Orderby("start_time ASC"),
	)
	if db.IsErrorNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, errors.Default.Wrap(err, "find the oldest unfinished execution")
	}
	return oldest.StartTime, nil
}

// executionCutoff is the start time from which runs are collected; nil collects everything.
func executionCutoff(since, oldestUnfinished *time.Time) *time.Time {
	if since == nil || oldestUnfinished == nil || since.Before(*oldestUnfinished) {
		return since
	}
	return oldestUnfinished
}

// takeExecutionsSince keeps the leading runs that started at or after the cutoff and reports whether it met an older one.
func takeExecutionsSince(items []json.RawMessage, cutoff *time.Time) ([]json.RawMessage, bool, errors.Error) {
	if cutoff == nil {
		return items, false, nil
	}
	for i, item := range items {
		var summary AwsPipelineExecutionSummary
		if err := errors.Convert(json.Unmarshal(item, &summary)); err != nil {
			return nil, false, err
		}
		if start := awsEpochTime(summary.StartTime); start != nil && start.Before(*cutoff) {
			return items[:i], true, nil
		}
	}
	return items, false, nil
}

func parseExecutionsSince(cutoff *time.Time) func(res *http.Response) ([]json.RawMessage, errors.Error) {
	return func(res *http.Response) ([]json.RawMessage, errors.Error) {
		items, err := parseAwsItems(res, awsListKeyExecutions)
		if err != nil {
			return nil, err
		}
		rows, reachedCutoff, err := takeExecutionsSince(items, cutoff)
		if err != nil {
			return nil, err
		}
		if reachedCutoff {
			return rows, api.ErrFinishCollect
		}
		return rows, nil
	}
}
