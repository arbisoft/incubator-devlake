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

func TestAwsPipelineConsoleUrl(t *testing.T) {
	tests := []struct {
		region, want string
	}{
		{"us-east-2", "https://us-east-2.console.aws.amazon.com/codesuite/codepipeline/pipelines/web/view?region=us-east-2"},
		{"cn-north-1", ""},
		{"us-gov-west-1", ""},
	}
	for _, tt := range tests {
		t.Run(tt.region, func(t *testing.T) {
			require.Equal(t, tt.want, AwsPipelineConsoleUrl(tt.region, "web"))
		})
	}
}

func TestAwsPipelineScopeIdentity(t *testing.T) {
	p := AwsPipeline{Arn: "arn:aws:codepipeline:us-east-2:123456789012:web", Region: "us-east-2", Name: "web"}
	p.ConnectionId = 3
	require.Equal(t, p.Arn, p.ScopeId())
	require.Equal(t, "web", p.ScopeName())
	require.Equal(t, "us-east-2/web", p.ScopeFullName())
	require.Equal(t, &AwsApiParams{ConnectionId: 3, ScopeId: p.Arn}, p.ScopeParams())
}

func TestSplitAwsAction(t *testing.T) {
	service, name := SplitAwsAction(AwsActionListPipelines)
	require.Equal(t, "codepipeline", service)
	require.Equal(t, "ListPipelines", name)
}
