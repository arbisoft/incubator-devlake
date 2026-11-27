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
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/helpers/unithelper"
	mockcontext "github.com/apache/incubator-devlake/mocks/core/context"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/require"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) *api.ApiClient {
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	basicRes := new(mockcontext.BasicRes)
	basicRes.On("GetConfigReader").Return(viper.New())
	basicRes.On("GetLogger").Return(unithelper.DummyLogger())
	client, err := api.NewApiClient(context.Background(), server.URL+"/", map[string]string{"Content-Type": awsJsonContentType}, 0, "", basicRes)
	require.NoError(t, err)
	return client
}

func TestAwsTarget(t *testing.T) {
	tests := []struct {
		service AwsService
		want    string
	}{
		{AwsServiceCodePipeline, "CodePipeline_20150709.ListPipelines"},
		{AwsServiceCodeBuild, "CodeBuild_20161006.ListPipelines"},
		{AwsServiceLogs, "Logs_20140328.ListPipelines"},
		{AwsServiceCostExplorer, "AWSInsightsIndexService.ListPipelines"},
	}
	for _, tt := range tests {
		t.Run(string(tt.service), func(t *testing.T) {
			require.Equal(t, tt.want, AwsTarget(tt.service, "ListPipelines"))
		})
	}
}

func TestPostAwsJson(t *testing.T) {
	t.Run("sends the target and decodes the response", func(t *testing.T) {
		var target, contentType string
		var sent AwsListPipelinesInput
		client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
			target, contentType = r.Header.Get(awsTargetHeader), r.Header.Get("Content-Type")
			body, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(body, &sent)
			_, _ = w.Write([]byte(`{"pipelines":[{"name":"web","pipelineType":"V2","executionMode":"QUEUED"}],"nextToken":"next"}`))
		})
		var out AwsListPipelinesOutput
		require.Nil(t, PostAwsJson(client, AwsServiceCodePipeline, "ListPipelines", AwsListPipelinesInput{MaxResults: 1}, &out))
		require.Equal(t, "CodePipeline_20150709.ListPipelines", target)
		require.Equal(t, awsJsonContentType, contentType)
		require.Equal(t, 1, sent.MaxResults)
		require.Equal(t, []AwsPipelineSummary{{Name: "web", PipelineType: "V2", ExecutionMode: "QUEUED"}}, out.Pipelines)
		require.Equal(t, "next", out.NextToken)
	})

	t.Run("error responses keep their status", func(t *testing.T) {
		tests := []struct {
			name     string
			status   int
			code     string
			wantHttp int
		}{
			{"denied", 400, "AccessDeniedException", http.StatusForbidden},
			{"bad credentials", 400, "UnrecognizedClientException", http.StatusUnauthorized},
			{"validation", 400, "ValidationException", http.StatusBadRequest},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
					w.WriteHeader(tt.status)
					_, _ = w.Write([]byte(`{"__type":"` + tt.code + `","message":"m"}`))
				})
				client.SetAfterFunction(api.NewAwsAfterResponse(func(_ time.Duration) {}))
				err := PostAwsJson(client, AwsServiceCodePipeline, "ListPipelines", AwsListPipelinesInput{}, &AwsNoOutput{})
				require.NotNil(t, err)
				require.Equal(t, tt.wantHttp, err.GetType().GetHttpCode())
			})
		}
	})
}

func TestGetAwsCallerIdentity(t *testing.T) {
	var query, accept string
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		query, accept = r.URL.RawQuery, r.Header.Get("Accept")
		_, _ = w.Write([]byte(`{"GetCallerIdentityResponse":{"GetCallerIdentityResult":{"Account":"123456789012","Arn":"arn:aws:iam::123456789012:user/broker","UserId":"AIDAEXAMPLE"}}}`))
	})
	identity, err := readAwsCallerIdentity(client)
	require.Nil(t, err)
	require.Equal(t, "Action=GetCallerIdentity&Version=2011-06-15", query)
	require.Equal(t, "application/json", accept)
	require.Equal(t, "123456789012", identity.Account)
	require.Equal(t, "arn:aws:iam::123456789012:user/broker", identity.Arn)
}
