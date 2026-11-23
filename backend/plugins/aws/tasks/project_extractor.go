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

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = ExtractProjects

var ExtractProjectsMeta = plugin.SubTaskMeta{
	Name:             "extractProjects",
	EntryPoint:       ExtractProjects,
	EnabledByDefault: true,
	Description:      "extract AWS CodeBuild projects",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

func ExtractProjects(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_PROJECT_TABLE)
	extractor, err := api.NewApiExtractor(api.ApiExtractorArgs{
		RawDataSubTaskArgs: *raw,
		Extract: func(row *api.RawData) ([]interface{}, errors.Error) {
			var project AwsCodebuildProjectDetail
			if err := errors.Convert(json.Unmarshal(row.Data, &project)); err != nil {
				return nil, err
			}
			return []interface{}{&models.AwsCodebuildProject{
				ConnectionId:           data.Options.ConnectionId,
				Name:                   project.Name,
				Arn:                    project.Arn,
				EnvironmentType:        project.Environment.Type,
				ComputeType:            project.Environment.ComputeType,
				Image:                  project.Environment.Image,
				TimeoutInMinutes:       project.TimeoutInMinutes,
				QueuedTimeoutInMinutes: project.QueuedTimeoutInMinutes,
			}}, nil
		},
	})
	if err != nil {
		return err
	}
	return extractor.Execute()
}
