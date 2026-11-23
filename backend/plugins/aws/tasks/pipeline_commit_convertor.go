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
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/models/domainlayer/code"
	"github.com/apache/incubator-devlake/core/models/domainlayer/devops"
	"github.com/apache/incubator-devlake/core/models/domainlayer/didgen"
	"github.com/apache/incubator-devlake/core/plugin"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = ConvertPipelineCommits

var ConvertPipelineCommitsMeta = plugin.SubTaskMeta{
	Name:             "convertPipelineCommits",
	EntryPoint:       ConvertPipelineCommits,
	EnabledByDefault: true,
	Description:      "convert AWS CodePipeline source revisions into pipeline commits",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

// awsGitBaseUrls lists the hosted git providers a repository URL can be built for.
var awsGitBaseUrls = map[models.AwsSourceProviderType]string{
	models.AwsSourceProviderGitHub:    "https://github.com/",
	models.AwsSourceProviderBitbucket: "https://bitbucket.org/",
	models.AwsSourceProviderGitLab:    "https://gitlab.com/",
}

const awsNoProviderType = "none"

type awsPipelineCommitRow struct {
	common.RawDataOrigin
	ExecutionId       string
	RevisionId        string
	ProviderType      string
	CommitMessage     string
	FullRepositoryId  string
	TriggerTagName    string
	TriggerBranchName string
	ActionBranchName  string
}

// firstNonEmpty returns the first value that is not empty.
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

// findRepoId returns the id of the domain repo with the URL, or "" when there is none.
func findRepoId(db dal.Dal, repoUrl string) (string, errors.Error) {
	var repo code.Repo
	err := db.First(&repo, dal.Where("url = ?", repoUrl))
	if db.IsErrorNotFound(err) {
		return "", nil
	}
	if err != nil {
		return "", errors.Default.Wrap(err, "look up the domain repo")
	}
	return repo.Id, nil
}

func ConvertPipelineCommits(taskCtx plugin.SubTaskContext) errors.Error {
	raw, data := CreateRawDataSubTaskArgs(taskCtx, RAW_EXECUTION_TABLE)
	db := taskCtx.GetDal()
	cursor, err := db.Cursor(
		dal.Select("r._raw_data_params, r._raw_data_table, r._raw_data_id, r._raw_data_remark, r.execution_id, r.revision_id, r.provider_type, r.commit_message, r.full_repository_id, e.trigger_tag_name, e.trigger_branch_name, COALESCE(a.branch_name, '') AS action_branch_name"),
		dal.From("_tool_aws_execution_source_revisions r"),
		dal.Join("JOIN _tool_aws_pipeline_executions e ON e.connection_id = r.connection_id AND e.execution_id = r.execution_id"),
		dal.Join("LEFT JOIN _tool_aws_pipeline_actions a ON a.connection_id = e.connection_id AND a.pipeline_arn = e.pipeline_arn AND a.action_name = r.action_name AND a.category = ?", models.AwsCategorySource),
		dal.Where("e.connection_id = ? AND e.pipeline_arn = ?", data.Options.ConnectionId, data.Options.ScopeId),
	)
	if err != nil {
		return err
	}
	defer cursor.Close()
	executionIdGen := didgen.NewDomainIdGenerator(&models.AwsPipelineExecution{})
	repoIds := make(map[string]string)
	skipped := make(map[string]int)
	converter, err := helper.NewDataConverter(helper.DataConverterArgs{
		RawDataSubTaskArgs: *raw,
		InputRowType:       reflect.TypeOf(awsPipelineCommitRow{}),
		Input:              cursor,
		Convert: func(inputRow interface{}) ([]interface{}, errors.Error) {
			revision := inputRow.(*awsPipelineCommitRow)
			baseUrl, isGit := awsGitBaseUrls[models.AwsSourceProviderType(revision.ProviderType)]
			if !isGit || revision.FullRepositoryId == "" {
				skipped[firstNonEmpty(revision.ProviderType, awsNoProviderType)]++
				return nil, nil
			}
			repoUrl := baseUrl + revision.FullRepositoryId
			repoId, known := repoIds[repoUrl]
			if !known {
				var err errors.Error
				if repoId, err = findRepoId(db, repoUrl); err != nil {
					return nil, err
				}
				repoIds[repoUrl] = repoId
			}
			return []interface{}{&devops.CiCDPipelineCommit{
				PipelineId: executionIdGen.Generate(data.Options.ConnectionId, revision.ExecutionId),
				CommitSha:  revision.RevisionId,
				CommitMsg:  revision.CommitMessage,
				Branch:     firstNonEmpty(revision.TriggerTagName, revision.TriggerBranchName, revision.ActionBranchName),
				RepoId:     repoId,
				RepoUrl:    repoUrl,
			}}, nil
		},
	})
	if err != nil {
		return err
	}
	if err = converter.Execute(); err != nil {
		return err
	}
	taskCtx.GetLogger().Info("skipped source revisions without a supported git repository, by provider type: %v", skipped)
	return nil
}
