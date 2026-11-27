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

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = ExtractPipelineDefinition

var ExtractPipelineDefinitionMeta = plugin.SubTaskMeta{
	Name:             "extractPipelineDefinition",
	EntryPoint:       ExtractPipelineDefinition,
	EnabledByDefault: true,
	Description:      "extract the AWS CodePipeline definition into the pipeline and action tables",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

func ExtractPipelineDefinition(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_PIPELINE_DEFINITION_TABLE)
	db := taskCtx.GetDal()
	extractor, err := api.NewApiExtractor(api.ApiExtractorArgs{
		RawDataSubTaskArgs: *raw,
		Extract: func(row *api.RawData) ([]interface{}, errors.Error) {
			var out AwsGetPipelineOutput
			if err := errors.Convert(json.Unmarshal(row.Data, &out)); err != nil {
				return nil, err
			}
			definition := out.Pipeline
			err := db.UpdateColumns(&models.AwsPipeline{}, []dal.DalSet{
				{ColumnName: "pipeline_type", Value: definition.PipelineType},
				{ColumnName: "execution_mode", Value: definition.ExecutionMode},
				{ColumnName: "version", Value: definition.Version},
			}, dal.Where("connection_id = ? AND arn = ?", data.Options.ConnectionId, data.Options.ScopeId))
			if err != nil {
				return nil, errors.Default.Wrap(err, "update the pipeline definition")
			}
			var rows []interface{}
			for _, stage := range definition.Stages {
				for _, action := range stage.Actions {
					rows = append(rows, &models.AwsPipelineAction{
						ConnectionId:     data.Options.ConnectionId,
						PipelineArn:      data.Options.ScopeId,
						StageName:        stage.Name,
						ActionName:       action.Name,
						Category:         action.ActionTypeId.Category,
						Provider:         action.ActionTypeId.Provider,
						ProjectName:      action.Configuration.ProjectName,
						BranchName:       action.Configuration.BranchName,
						FullRepositoryId: action.Configuration.FullRepositoryId,
					})
				}
			}
			return rows, nil
		},
	})
	if err != nil {
		return err
	}
	return extractor.Execute()
}
