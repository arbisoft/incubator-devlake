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
	"testing"

	lakeErrors "github.com/apache/incubator-devlake/core/errors"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/stretchr/testify/require"
)

func TestListAwsRemoteScopes(t *testing.T) {
	connection := &models.AwsConnection{AwsConn: models.AwsConn{
		AuthType: models.AwsAuthTypeAssumeRole,
		Regions:  []string{"us-east-1", "eu-west-1"},
	}}

	t.Run("no group lists one entry per region", func(t *testing.T) {
		children, next, err := listAwsRemoteScopes(connection, nil, "", awsPage{})
		require.Nil(t, err)
		require.Nil(t, next)
		require.Len(t, children, 2)
		for i, region := range connection.Regions {
			require.Equal(t, helper.RAS_ENTRY_TYPE_GROUP, children[i].Type)
			require.Equal(t, region, children[i].Id)
			require.Equal(t, region, children[i].Name)
		}
	})

	tests := []struct {
		name, groupId, wantMessage string
	}{
		{"region outside the connection", "ap-south-1", "not one of the connection's regions"},
		{"assume-role without a role ARN", "us-east-1", "Enter the role ARN first"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := listAwsRemoteScopes(connection, nil, tt.groupId, awsPage{})
			require.NotNil(t, err)
			require.Equal(t, lakeErrors.BadInput, err.GetType())
			require.Contains(t, err.Error(), tt.wantMessage)
		})
	}
}
