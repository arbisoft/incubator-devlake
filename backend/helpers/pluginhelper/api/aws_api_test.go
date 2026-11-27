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
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/stretchr/testify/require"
)

func TestAwsPartitionAndEndpoint(t *testing.T) {
	tests := []struct {
		region, partition, endpoint string
	}{
		{"us-east-1", AwsPartitionAws, "https://codepipeline.us-east-1.amazonaws.com"},
		{"eu-west-2", AwsPartitionAws, "https://codepipeline.eu-west-2.amazonaws.com"},
		{"cn-north-1", AwsPartitionChina, "https://codepipeline.cn-north-1.amazonaws.com.cn"},
		{"us-gov-west-1", AwsPartitionGovCloud, "https://codepipeline.us-gov-west-1.amazonaws.com"},
	}
	for _, tt := range tests {
		t.Run(tt.region, func(t *testing.T) {
			require.Equal(t, tt.partition, AwsPartitionForRegion(tt.region))
			require.Equal(t, tt.endpoint, AwsServiceEndpoint("codepipeline", tt.region))
		})
	}
}

func TestAwsPartitionFromArn(t *testing.T) {
	tests := []struct {
		name, arn, partition string
		wantErr              bool
	}{
		{"aws", "arn:aws:iam::123456789012:role/Reader", AwsPartitionAws, false},
		{"china", "arn:aws-cn:iam::123456789012:role/Reader", AwsPartitionChina, false},
		{"gov", "arn:aws-us-gov:codepipeline:us-gov-west-1:123456789012:p", AwsPartitionGovCloud, false},
		{"not an arn", "role/Reader", "", true},
		{"too short", "arn:aws:iam", "", true},
		{"empty partition", "arn::iam::123456789012:role/Reader", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			partition, err := AwsPartitionFromArn(tt.arn)
			if tt.wantErr {
				require.NotNil(t, err)
				require.Equal(t, errors.BadInput, err.GetType())
				return
			}
			require.Nil(t, err)
			require.Equal(t, tt.partition, partition)
		})
	}
}

func TestIsAwsRegion(t *testing.T) {
	tests := []struct {
		region string
		valid  bool
	}{
		{"us-east-1", true},
		{"ap-southeast-2", true},
		{"cn-north-1", true},
		{"us-gov-west-1", true},
		{"us-iso-east-1", true},
		{"us-isob-east-1", true},
		{"", false},
		{"useast1", false},
		{"US-EAST-1", false},
		{"us-east-", false},
		{"us-east-1 ", false},
	}
	for _, tt := range tests {
		t.Run(tt.region, func(t *testing.T) {
			require.Equal(t, tt.valid, IsAwsRegion(tt.region))
		})
	}
}

func newAwsTestResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body))}
}

func TestParseAwsApiError(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		body    string
		code    string
		message string
	}{
		{"type with prefix", 400, `{"__type":"com.amazonaws.codepipeline#ValidationException","message":"bad"}`, "ValidationException", "bad"},
		{"type without prefix", 400, `{"__type":"AccessDeniedException","message":"no"}`, "AccessDeniedException", "no"},
		{"capitalised message", 403, `{"__type":"AccessDeniedException","Message":"Denied"}`, "AccessDeniedException", "Denied"},
		{"query api error", 403, `{"Error":{"Code":"InvalidClientTokenId","Message":"bad token","Type":"Sender"},"RequestId":"r"}`, "InvalidClientTokenId", "bad token"},
		{"non-json body", 502, `<html>bad gateway</html>`, "", ""},
		{"empty body", 500, ``, "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := newAwsTestResponse(tt.status, tt.body)
			apiErr := ParseAwsApiError(res)
			require.NotNil(t, apiErr)
			require.Equal(t, tt.status, apiErr.StatusCode)
			require.Equal(t, tt.code, apiErr.Code)
			require.Equal(t, tt.message, apiErr.Message)
			again, err := io.ReadAll(res.Body)
			require.NoError(t, err)
			require.Equal(t, tt.body, string(again))
		})
	}

	t.Run("success has no error", func(t *testing.T) {
		require.Nil(t, ParseAwsApiError(newAwsTestResponse(200, `{}`)))
	})
}

func TestAwsErrorMessageIncludesCode(t *testing.T) {
	err := &AwsApiError{StatusCode: 403, Code: "AccessDeniedException", Message: "nope"}
	require.Contains(t, err.Error(), "AccessDeniedException")
	require.Contains(t, err.Error(), "nope")
	code, message := ParseAwsError(errors.Forbidden.Wrap(err, "AWS denied access"))
	require.Equal(t, "AccessDeniedException", code)
	require.Equal(t, "nope", message)
	code, _ = ParseAwsError(errors.Default.New("other"))
	require.Equal(t, "", code)
}

func TestNewAwsAfterResponse(t *testing.T) {
	tests := []struct {
		name      string
		status    int
		code      string
		wantHttp  int
		wantSleep bool
	}{
		{"throttling", 400, "ThrottlingException", http.StatusTooManyRequests, true},
		{"too many requests", 429, "TooManyRequestsException", http.StatusTooManyRequests, true},
		{"request limit", 503, "RequestLimitExceeded", http.StatusTooManyRequests, true},
		{"access denied exception", 400, "AccessDeniedException", http.StatusForbidden, false},
		{"access denied", 403, "AccessDenied", http.StatusForbidden, false},
		{"unauthorized operation", 403, "UnauthorizedOperation", http.StatusForbidden, false},
		{"unrecognized client", 400, "UnrecognizedClientException", http.StatusUnauthorized, false},
		{"expired token query api", 400, "ExpiredToken", http.StatusUnauthorized, false},
		{"expired token", 400, "ExpiredTokenException", http.StatusUnauthorized, false},
		{"signature mismatch", 403, "SignatureDoesNotMatch", http.StatusUnauthorized, false},
		{"other", 400, "ValidationException", http.StatusBadRequest, false},
		{"server error", 500, "InternalFailure", http.StatusInternalServerError, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var slept []time.Duration
			hook := NewAwsAfterResponse(func(d time.Duration) { slept = append(slept, d) })
			err := hook(newAwsTestResponse(tt.status, `{"__type":"`+tt.code+`","message":"m"}`))
			require.NotNil(t, err)
			require.Equal(t, tt.wantHttp, err.GetType().GetHttpCode())
			code, _ := ParseAwsError(err)
			require.Equal(t, tt.code, code)
			if tt.wantSleep {
				require.Equal(t, []time.Duration{awsThrottleBackoff}, slept)
			} else {
				require.Empty(t, slept)
			}
		})
	}

	t.Run("success is untouched", func(t *testing.T) {
		hook := NewAwsAfterResponse(func(time.Duration) { t.Fatal("must not sleep") })
		res := newAwsTestResponse(200, `{"ok":true}`)
		require.Nil(t, hook(res))
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		require.Equal(t, `{"ok":true}`, string(body))
	})
}
