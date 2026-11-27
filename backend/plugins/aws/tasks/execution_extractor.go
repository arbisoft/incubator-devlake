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
	"net/url"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

const revisionRepositoryParam = "FullRepositoryId"

var _ plugin.SubTaskEntryPoint = ExtractExecutions

var ExtractExecutionsMeta = plugin.SubTaskMeta{
	Name:             "extractExecutions",
	EntryPoint:       ExtractExecutions,
	EnabledByDefault: true,
	Description:      "extract AWS CodePipeline executions into the execution and source revision tables",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

type awsTriggerDetail struct {
	TagName    string `json:"tagName"`
	BranchName string `json:"branchName"`
}

type awsRevisionSummary struct {
	ProviderType  string `json:"ProviderType"`
	CommitMessage string `json:"CommitMessage"`
}

// parseTriggerDetail reads the tag and branch of a trigger detail; a detail that is not JSON, such as a bare ARN, has neither.
func parseTriggerDetail(detail string) awsTriggerDetail {
	var parsed awsTriggerDetail
	if json.Unmarshal([]byte(detail), &parsed) != nil {
		return awsTriggerDetail{}
	}
	return parsed
}

// parseRevisionSummary reads the provider and commit message of a revision summary; other kinds of summary give neither.
func parseRevisionSummary(summary string) awsRevisionSummary {
	var parsed awsRevisionSummary
	if json.Unmarshal([]byte(summary), &parsed) != nil {
		return awsRevisionSummary{}
	}
	return parsed
}

// fullRepositoryIdFromUrl reads the repository from a revision URL, or returns "" when it has none.
func fullRepositoryIdFromUrl(revisionUrl string) string {
	parsed, err := url.Parse(revisionUrl)
	if err != nil {
		return ""
	}
	return parsed.Query().Get(revisionRepositoryParam)
}

func ExtractExecutions(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_EXECUTION_TABLE)
	extractor, err := api.NewApiExtractor(api.ApiExtractorArgs{
		RawDataSubTaskArgs: *raw,
		Extract: func(row *api.RawData) ([]interface{}, errors.Error) {
			var summary AwsPipelineExecutionSummary
			if err := errors.Convert(json.Unmarshal(row.Data, &summary)); err != nil {
				return nil, err
			}
			executionType := summary.ExecutionType
			if executionType == "" {
				executionType = string(models.AwsExecutionTypeStandard)
			}
			trigger := parseTriggerDetail(summary.Trigger.TriggerDetail)
			rows := []interface{}{&models.AwsPipelineExecution{
				ConnectionId:      data.Options.ConnectionId,
				ExecutionId:       summary.PipelineExecutionId,
				PipelineArn:       data.Options.ScopeId,
				Status:            summary.Status,
				ExecutionMode:     summary.ExecutionMode,
				ExecutionType:     executionType,
				TriggerType:       summary.Trigger.TriggerType,
				TriggerTagName:    trigger.TagName,
				TriggerBranchName: trigger.BranchName,
				StartTime:         awsEpochTime(summary.StartTime),
				LastUpdateTime:    awsEpochTime(summary.LastUpdateTime),
			}}
			for _, revision := range summary.SourceRevisions {
				revisionSummary := parseRevisionSummary(revision.RevisionSummary)
				rows = append(rows, &models.AwsExecutionSourceRevision{
					ConnectionId:     data.Options.ConnectionId,
					ExecutionId:      summary.PipelineExecutionId,
					ActionName:       revision.ActionName,
					RevisionId:       revision.RevisionId,
					RevisionUrl:      revision.RevisionUrl,
					ProviderType:     revisionSummary.ProviderType,
					CommitMessage:    revisionSummary.CommitMessage,
					FullRepositoryId: fullRepositoryIdFromUrl(revision.RevisionUrl),
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
