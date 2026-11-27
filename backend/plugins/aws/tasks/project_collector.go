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

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = CollectProjects

var CollectProjectsMeta = plugin.SubTaskMeta{
	Name:             "collectProjects",
	EntryPoint:       CollectProjects,
	EnabledByDefault: true,
	Description:      "collect the AWS CodeBuild projects the pipeline uses",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

func CollectProjects(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_PROJECT_TABLE)
	var names []string
	err := taskCtx.GetDal().Pluck(
		"project_name",
		&names,
		dal.From(&models.AwsPipelineAction{}),
		dal.Where("connection_id = ? AND pipeline_arn = ? AND project_name != ''", data.Options.ConnectionId, data.Options.ScopeId),
		dal.Groupby("project_name"),
	)
	if err != nil {
		return errors.Default.Wrap(err, "list the CodeBuild projects of the pipeline")
	}
	if len(names) == 0 {
		return nil
	}
	args := awsCollectorArgs(taskCtx.GetLogger(), awsCollectorSpec{
		Client: data.CodeBuildClient,
		Action: models.AwsActionBatchGetProjects,
		Request: func(_ interface{}, _ string) interface{} {
			return AwsBatchGetProjectsInput{Names: names}
		},
		Parse: parseProjects,
	})
	return executeAwsCollector(*raw, args)
}

func parseProjects(res *http.Response) ([]json.RawMessage, errors.Error) {
	return parseAwsItems(res, awsListKeyProjects)
}
