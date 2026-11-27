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

package models

import (
	"encoding/json"
	"testing"

	"github.com/apache/incubator-devlake/core/utils"
	"github.com/stretchr/testify/require"
)

func TestPermissionPolicy(t *testing.T) {
	tests := []struct {
		name            string
		useCostExplorer bool
		wantCe          bool
	}{
		{"cost explorer off", false, false},
		{"cost explorer on", true, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			policy := PermissionPolicy("aws-cn", tt.useCostExplorer)
			require.Len(t, policy.Statement, 2)
			require.Equal(t, "*", policy.Statement[0].Resource)
			require.Contains(t, policy.Statement[0].Action, AwsActionListPipelines)
			require.NotContains(t, policy.Statement[0].Action, AwsActionGetLogEvents)
			require.NotContains(t, policy.Statement[0].Action, AwsActionAssumeRole)
			require.Equal(t, tt.wantCe, utils.StringsContains(policy.Statement[0].Action, AwsActionGetCostAndUsage))
			require.Equal(t, []string{AwsActionGetLogEvents}, policy.Statement[1].Action)
			require.Equal(t, "arn:aws-cn:logs:*:*:log-group:/aws/codebuild/*", policy.Statement[1].Resource)
		})
	}
}

func TestTrustPolicy(t *testing.T) {
	raw, err := json.Marshal(TrustPolicy("arn:aws:iam::123456789012:user/broker", "external-1"))
	require.NoError(t, err)
	require.JSONEq(t, `{
		"Version": "2012-10-17",
		"Statement": [{
			"Effect": "Allow",
			"Action": ["sts:AssumeRole"],
			"Principal": {"AWS": "arn:aws:iam::123456789012:user/broker"},
			"Condition": {"StringEquals": {"sts:ExternalId": "external-1"}}
		}]
	}`, string(raw))
}

func TestBrokerPolicy(t *testing.T) {
	tests := []struct {
		name, roleArn, wantResource string
	}{
		{"role arn set", "arn:aws:iam::123456789012:role/Reader", "arn:aws:iam::123456789012:role/Reader"},
		{"role arn empty uses placeholder", "", "arn:aws-us-gov:iam::<account-id>:role/DevLakeReadOnly"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			policy := BrokerPolicy("aws-us-gov", tt.roleArn)
			require.Equal(t, []string{AwsActionAssumeRole}, policy.Statement[0].Action)
			require.Equal(t, tt.wantResource, policy.Statement[0].Resource)
			require.Nil(t, policy.Statement[0].Principal)
		})
	}
}
