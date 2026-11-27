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

var _ plugin.SubTaskEntryPoint = ExtractBuilds

var ExtractBuildsMeta = plugin.SubTaskMeta{
	Name:             "extractBuilds",
	EntryPoint:       ExtractBuilds,
	EnabledByDefault: true,
	Description:      "extract AWS CodeBuild builds and their phases",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

// firstContextMessage returns the first non-empty message of a build phase.
func firstContextMessage(phase AwsBuildPhase) string {
	for _, phaseContext := range phase.Contexts {
		if phaseContext.Message != "" {
			return truncateText(phaseContext.Message, awsTextLimit)
		}
	}
	return ""
}

// failedPhaseMessage returns the message of the first phase that failed, faulted or timed out.
func failedPhaseMessage(phases []AwsBuildPhase) string {
	for _, phase := range phases {
		if models.AwsFailedBuildPhaseStatuses[models.AwsBuildPhaseStatus(phase.PhaseStatus)] {
			return firstContextMessage(phase)
		}
	}
	return ""
}

func ExtractBuilds(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_BUILD_TABLE)
	extractor, err := api.NewApiExtractor(api.ApiExtractorArgs{
		RawDataSubTaskArgs: *raw,
		Extract: func(row *api.RawData) ([]interface{}, errors.Error) {
			var build AwsBuildDetail
			if err := errors.Convert(json.Unmarshal(row.Data, &build)); err != nil {
				return nil, err
			}
			rows := []interface{}{&models.AwsCodebuildBuild{
				ConnectionId:          data.Options.ConnectionId,
				BuildId:               build.Id,
				ProjectName:           build.ProjectName,
				BuildNumber:           build.BuildNumber,
				BuildStatus:           build.BuildStatus,
				BuildComplete:         build.BuildComplete,
				CurrentPhase:          build.CurrentPhase,
				StartTime:             awsEpochTime(build.StartTime),
				EndTime:               awsEpochTime(build.EndTime),
				Initiator:             build.Initiator,
				ResolvedSourceVersion: build.ResolvedSourceVersion,
				EnvironmentType:       build.Environment.Type,
				ComputeType:           build.Environment.ComputeType,
				Image:                 build.Environment.Image,
				TimeoutInMinutes:      build.TimeoutInMinutes,
				LogGroup:              build.Logs.GroupName,
				LogStream:             build.Logs.StreamName,
				FailureMessage:        failedPhaseMessage(build.Phases),
			}}
			for _, phase := range build.Phases {
				rows = append(rows, &models.AwsCodebuildBuildPhase{
					ConnectionId:   data.Options.ConnectionId,
					BuildId:        build.Id,
					PhaseType:      phase.PhaseType,
					PhaseStatus:    phase.PhaseStatus,
					StartTime:      awsEpochTime(phase.StartTime),
					EndTime:        awsEpochTime(phase.EndTime),
					DurationSec:    phase.DurationInSeconds,
					ContextMessage: firstContextMessage(phase),
				})
			}
			return rows, nil
		},
	})
	if err != nil {
		return err
	}
	return extractor.Execute()
}
