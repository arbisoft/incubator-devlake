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

package api

import (
	gocontext "context"
	"fmt"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/core/utils"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	dsmodels "github.com/apache/incubator-devlake/helpers/pluginhelper/api/models"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/apache/incubator-devlake/plugins/aws/tasks"
)

const remotePageSize = 100

// awsPage is the paging state passed between remote scope requests.
type awsPage struct {
	NextToken string `json:"nextToken"`
}

func listAwsRemoteScopes(
	connection *models.AwsConnection,
	_ plugin.ApiClient,
	groupId string,
	page awsPage,
) (
	children []dsmodels.DsRemoteApiScopeListEntry[models.AwsPipeline],
	nextPage *awsPage,
	err errors.Error,
) {
	if groupId == "" {
		for _, region := range connection.Regions {
			children = append(children, dsmodels.DsRemoteApiScopeListEntry[models.AwsPipeline]{
				Type: helper.RAS_ENTRY_TYPE_GROUP, Id: region, Name: region,
			})
		}
		return children, nil, nil
	}
	if !utils.StringsContains(connection.Regions, groupId) {
		return nil, nil, errors.BadInput.New(fmt.Sprintf("%s is not one of the connection's regions", groupId))
	}
	if connection.MissingRoleArn() {
		return nil, nil, errors.BadInput.New("Enter the role ARN first")
	}
	ctx := gocontext.TODO()
	provider, err := connection.NewCredentialsProvider()
	if err != nil {
		return nil, nil, err
	}
	identity, err := tasks.GetAwsCallerIdentity(ctx, basicRes, provider, groupId)
	if err != nil {
		return nil, nil, errors.Default.Wrap(err, "look up the AWS account")
	}
	client, err := tasks.NewAwsApiClient(ctx, basicRes, provider, tasks.AwsServiceCodePipeline, groupId)
	if err != nil {
		return nil, nil, err
	}
	var out tasks.AwsListPipelinesOutput
	_, action := models.SplitAwsAction(models.AwsActionListPipelines)
	if err = tasks.PostAwsJson(client, tasks.AwsServiceCodePipeline, action, tasks.AwsListPipelinesInput{
		MaxResults: remotePageSize, NextToken: page.NextToken,
	}, &out); err != nil {
		return nil, nil, errors.Default.Wrap(err, "list pipelines in "+groupId)
	}
	partition := helper.AwsPartitionForRegion(groupId)
	for _, p := range out.Pipelines {
		arn := fmt.Sprintf("arn:%s:%s:%s:%s:%s", partition, tasks.AwsServiceCodePipeline, groupId, identity.Account, p.Name)
		children = append(children, dsmodels.DsRemoteApiScopeListEntry[models.AwsPipeline]{
			Type:     helper.RAS_ENTRY_TYPE_SCOPE,
			ParentId: &groupId,
			Id:       arn,
			Name:     p.Name,
			FullName: groupId + "/" + p.Name,
			Data: &models.AwsPipeline{
				Arn:           arn,
				Region:        groupId,
				Name:          p.Name,
				PipelineType:  p.PipelineType,
				ExecutionMode: p.ExecutionMode,
				Url:           models.AwsPipelineConsoleUrl(groupId, p.Name),
			},
		})
	}
	if out.NextToken != "" {
		nextPage = &awsPage{NextToken: out.NextToken}
	}
	return children, nextPage, nil
}

// RemoteScopes list all available scope for users
// @Summary list all available scope for users
// @Description list all available scope for users
// @Tags plugins/aws
// @Accept application/json
// @Param connectionId path int false "connection ID"
// @Param groupId query string false "group ID"
// @Param pageToken query string false "page Token"
// @Success 200  {object} api.RemoteScopesOutput
// @Failure 400  {object} shared.ApiBody "Bad Request"
// @Failure 500  {object} shared.ApiBody "Internal Error"
// @Router /plugins/aws/connections/{connectionId}/remote-scopes [GET]
func RemoteScopes(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	return raScopeList.Get(input)
}
