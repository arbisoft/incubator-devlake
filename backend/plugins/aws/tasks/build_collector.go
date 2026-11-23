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

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = CollectBuilds

var CollectBuildsMeta = plugin.SubTaskMeta{
	Name:             "collectBuilds",
	EntryPoint:       CollectBuilds,
	EnabledByDefault: true,
	Description:      "collect AWS CodeBuild builds",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

func CollectBuilds(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_BUILD_TABLE)
	db := taskCtx.GetDal()
	cursor, err := db.Cursor(
		dal.Select("DISTINCT a.external_execution_id"),
		dal.From("_tool_aws_action_executions a"),
		dal.Join("LEFT JOIN _tool_aws_codebuild_builds b ON b.connection_id = a.connection_id AND b.build_id = a.external_execution_id"),
		dal.Where(
			"a.connection_id = ? AND a.pipeline_arn = ? AND a.provider = ? AND a.external_execution_id != '' AND (b.build_id IS NULL OR b.build_complete = ?)",
			data.Options.ConnectionId, data.Options.ScopeId, models.AwsProviderCodeBuild, false,
		),
	)
	if err != nil {
		return errors.Default.Wrap(err, "list the builds to collect")
	}
	input, err := api.NewBatchedDalCursorIterator(db, cursor, reflect.TypeOf(""), awsBatchGetLimit)
	if err != nil {
		return err
	}
	args := awsCollectorArgs(taskCtx.GetLogger(), awsCollectorSpec{
		Client: data.CodeBuildClient,
		Action: models.AwsActionBatchGetBuilds,
		Input:  input,
		Request: func(input interface{}, _ string) interface{} {
			batch := input.([]interface{})
			ids := make([]string, len(batch))
			for i, id := range batch {
				ids[i] = *id.(*string)
			}
			return AwsBatchGetBuildsInput{Ids: ids}
		},
		Parse: parseBuilds,
	})
	args.PreserveRawData = true // AWS expires run history, so a full sync keeps the runs it no longer returns
	return executeAwsCollector(*raw, args)
}

func parseBuilds(res *http.Response) ([]json.RawMessage, errors.Error) {
	return parseAwsItems(res, awsListKeyBuilds)
}
