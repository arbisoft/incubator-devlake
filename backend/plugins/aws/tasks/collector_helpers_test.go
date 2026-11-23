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
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/helpers/unithelper"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func newJsonResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body))}
}

func TestAwsAfterResponse(t *testing.T) {
	logger := unithelper.DummyLogger()
	logger.On("Warn", mock.Anything, mock.Anything, mock.Anything).Once()
	afterResponse := awsAfterResponse(logger)
	require.Nil(t, afterResponse(newJsonResponse(http.StatusOK, `{}`)))
	require.True(t, errors.Is(
		afterResponse(newJsonResponse(http.StatusBadRequest, `{"__type":"PipelineNotFoundException","message":"gone"}`)),
		api.ErrIgnoreAndContinue,
	))
	err := afterResponse(newJsonResponse(http.StatusForbidden, `{"__type":"AccessDeniedException","message":"no"}`))
	require.NotNil(t, err)
	require.False(t, errors.Is(err, api.ErrIgnoreAndContinue))
	logger.AssertExpectations(t)
}

func TestAwsNextToken(t *testing.T) {
	token, err := awsNextToken(nil, newJsonResponse(http.StatusOK, `{"nextToken":"abc"}`))
	require.Nil(t, err)
	require.Equal(t, "abc", token)
	_, err = awsNextToken(nil, newJsonResponse(http.StatusOK, `{}`))
	require.True(t, errors.Is(err, api.ErrFinishCollect))
}

func TestAwsRequestBodyPutsTheTokenInTheInput(t *testing.T) {
	body := awsRequestBody(AwsListPipelineExecutionsInput{PipelineName: "acme-pipeline", MaxResults: 100, NextToken: "abc"})
	require.Equal(t, map[string]interface{}{"pipelineName": "acme-pipeline", "maxResults": float64(100), "nextToken": "abc"}, body)
	body = awsRequestBody(AwsListPipelineExecutionsInput{PipelineName: "acme-pipeline", MaxResults: 100})
	require.NotContains(t, body, "nextToken")
}
