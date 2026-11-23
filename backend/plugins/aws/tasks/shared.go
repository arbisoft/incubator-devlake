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
	"math"
	"time"

	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

const (
	RAW_PIPELINE_DEFINITION_TABLE = "aws_pipelines"
	RAW_EXECUTION_TABLE           = "aws_pipeline_executions"
	RAW_ACTION_EXECUTION_TABLE    = "aws_action_executions"
	RAW_PROJECT_TABLE             = "aws_codebuild_projects"
	RAW_BUILD_TABLE               = "aws_codebuild_builds"
)

const (
	awsCollectorPageSize = 100
	awsBatchGetLimit     = 100
	awsTextLimit         = 1024
)

// CreateRawDataSubTaskArgs builds the raw table arguments shared by the subtasks of one scope.
func CreateRawDataSubTaskArgs(taskCtx plugin.SubTaskContext, rawTable string) (*api.RawDataSubTaskArgs, *AwsTaskData) {
	data := taskCtx.GetData().(*AwsTaskData)
	return &api.RawDataSubTaskArgs{
		Ctx:    taskCtx,
		Params: models.AwsApiParams{ConnectionId: data.Options.ConnectionId, ScopeId: data.Options.ScopeId},
		Table:  rawTable,
	}, data
}

// awsEpochTime converts the epoch-second float AWS returns to a UTC time.
func awsEpochTime(seconds *float64) *time.Time {
	if seconds == nil {
		return nil
	}
	t := time.UnixMilli(int64(math.Round(*seconds * 1000))).UTC()
	return &t
}

// truncateText cuts a string to at most limit runes.
func truncateText(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit])
}
