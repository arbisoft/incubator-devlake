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
	"github.com/apache/incubator-devlake/core/plugin"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = ConvertPipelineScope

var ConvertPipelineScopeMeta = plugin.SubTaskMeta{
	Name:             "convertPipelineScope",
	EntryPoint:       ConvertPipelineScope,
	EnabledByDefault: true,
	Description:      "convert the AWS pipeline scope into a CI/CD scope",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

func ConvertPipelineScope(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_PIPELINE_DEFINITION_TABLE)
	cursor, err := taskCtx.GetDal().Cursor(
		dal.From(&models.AwsPipeline{}),
		dal.Where("connection_id = ? AND arn = ?", data.Options.ConnectionId, data.Options.ScopeId),
	)
	if err != nil {
		return err
	}
	defer cursor.Close()
	converter, err := helper.NewDataConverter(helper.DataConverterArgs{
		RawDataSubTaskArgs: *raw,
		InputRowType:       reflect.TypeOf(models.AwsPipeline{}),
		Input:              cursor,
		Convert: func(inputRow interface{}) ([]interface{}, errors.Error) {
			return []interface{}{models.NewAwsCicdScope(data.Options.ConnectionId, inputRow.(*models.AwsPipeline))}, nil
		},
	})
	if err != nil {
		return err
	}
	return converter.Execute()
}
