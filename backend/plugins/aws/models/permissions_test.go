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
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAwsPermissionsFor(t *testing.T) {
	tests := []struct {
		name            string
		authType        AwsAuthType
		useCostExplorer bool
		wantPresent     []string
		wantAbsent      []string
	}{
		{"assume-role without cost explorer", AwsAuthTypeAssumeRole, false,
			[]string{AwsActionAssumeRole, AwsActionListPipelines}, []string{AwsActionGetCostAndUsage}},
		{"assume-role with cost explorer", AwsAuthTypeAssumeRole, true,
			[]string{AwsActionAssumeRole, AwsActionGetCostAndUsage, AwsActionGetCostForecast}, nil},
		{"access key without cost explorer", AwsAuthTypeAccessKey, false,
			[]string{AwsActionListPipelines}, []string{AwsActionAssumeRole, AwsActionGetCostAndUsage}},
		{"access key with cost explorer", AwsAuthTypeAccessKey, true,
			[]string{AwsActionGetCostAndUsage}, []string{AwsActionAssumeRole}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var actions []string
			for _, p := range AwsPermissionsFor(tt.authType, tt.useCostExplorer) {
				actions = append(actions, p.Action)
			}
			for _, want := range tt.wantPresent {
				require.Contains(t, actions, want)
			}
			for _, absent := range tt.wantAbsent {
				require.NotContains(t, actions, absent)
			}
		})
	}
}
