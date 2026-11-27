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

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = CollectPipelineDefinition

var CollectPipelineDefinitionMeta = plugin.SubTaskMeta{
	Name:             "collectPipelineDefinition",
	EntryPoint:       CollectPipelineDefinition,
	EnabledByDefault: true,
	Description:      "collect the AWS CodePipeline definition",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

func CollectPipelineDefinition(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_PIPELINE_DEFINITION_TABLE)
	args := awsCollectorArgs(taskCtx.GetLogger(), awsCollectorSpec{
		Client: data.CodePipelineClient,
		Action: models.AwsActionGetPipeline,
		Request: func(_ interface{}, _ string) interface{} {
			return AwsGetPipelineInput{Name: data.Scope.Name}
		},
		Parse: func(res *http.Response) ([]json.RawMessage, errors.Error) {
			return parseAwsItems(res, "")
		},
	})
	return executeAwsCollector(*raw, args)
}
