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
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/apache/incubator-devlake/plugins/aws/tasks"
)

// AwsSetupResponse carries what an admin needs to create the role; access-key mode only has the permission policy.
type AwsSetupResponse struct {
	ExternalId        string                    `json:"externalId,omitempty"`
	BrokerArn         string                    `json:"brokerArn,omitempty"`
	BrokerArnResolved *bool                     `json:"brokerArnResolved,omitempty"`
	TrustPolicy       *models.AwsPolicyDocument `json:"trustPolicy,omitempty"`
	BrokerPolicy      *models.AwsPolicyDocument `json:"brokerPolicy,omitempty"`
	PermissionPolicy  models.AwsPolicyDocument  `json:"permissionPolicy"`
	Permissions       []models.AwsPermission    `json:"permissions"`
}

// resolveBrokerArn asks STS who the broker key belongs to and falls back to a placeholder.
func resolveBrokerArn(ctx gocontext.Context, connection *models.AwsConnection, partition string) (string, bool) {
	cfg := connection.CredentialsConfig()
	cfg.RoleArn = ""
	provider, err := helper.NewAwsCredentialsProvider(cfg)
	if err == nil {
		var identity *tasks.AwsCallerIdentity
		if identity, err = tasks.GetAwsCallerIdentity(ctx, basicRes, provider, connection.Regions[0]); err == nil && identity.Arn != "" {
			return identity.Arn, true
		}
	}
	return fmt.Sprintf("arn:%s:iam::<broker-account-id>:user/<broker-user>", partition), false
}

// GetSetup returns the External ID and the IAM policies for a connection
// @Summary get the AWS setup snippets of a connection
// @Description Get the External ID and the trust, broker and permission policies
// @Tags plugins/aws
// @Param connectionId path int true "connection ID"
// @Success 200  {object} AwsSetupResponse
// @Failure 400  {object} shared.ApiBody "Bad Request"
// @Failure 500  {object} shared.ApiBody "Internal Error"
// @Router /plugins/aws/connections/{connectionId}/setup [GET]
func GetSetup(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	connection, err := dsHelper.ConnApi.FindByPk(input)
	if err != nil {
		return nil, err
	}
	partition := helper.AwsPartitionForRegion(connection.Regions[0])
	if connection.RoleArn != "" {
		if partition, err = helper.AwsPartitionFromArn(connection.RoleArn); err != nil {
			return nil, err
		}
	}
	res := &AwsSetupResponse{
		PermissionPolicy: models.PermissionPolicy(partition, connection.UseCostExplorer),
		Permissions:      models.AwsPermissionsFor(connection.AuthType, connection.UseCostExplorer),
	}
	if connection.AuthType == models.AwsAuthTypeAssumeRole {
		brokerArn, resolved := resolveBrokerArn(gocontext.TODO(), connection, partition)
		trust := models.TrustPolicy(brokerArn, connection.ExternalId)
		broker := models.BrokerPolicy(partition, connection.RoleArn)
		res.ExternalId, res.BrokerArn, res.BrokerArnResolved = connection.ExternalId, brokerArn, &resolved
		res.TrustPolicy, res.BrokerPolicy = &trust, &broker
	}
	return &plugin.ApiResourceOutput{Body: res}, nil
}
