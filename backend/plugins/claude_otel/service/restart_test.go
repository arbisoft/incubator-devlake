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

package service

import (
	"net/http"
	"testing"
)

func TestRestartHintForStatus(t *testing.T) {
	testCases := []struct {
		name       string
		statusCode int
		retryAfter string
		expected   string
	}{
		{
			name:       "restart in progress",
			statusCode: http.StatusConflict,
			expected:   "Collector restart is already in progress. Retry Apply shortly.",
		},
		{
			name:       "cooldown with retry after",
			statusCode: http.StatusTooManyRequests,
			retryAfter: "30",
			expected:   "Collector is cooling down. Retry Apply in about 30 seconds.",
		},
		{
			name:       "cooldown with invalid retry after",
			statusCode: http.StatusTooManyRequests,
			retryAfter: "tomorrow",
			expected:   "Collector is cooling down. Retry Apply shortly.",
		},
		{
			name:       "unexpected status",
			statusCode: http.StatusInternalServerError,
			expected:   "",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			response := &http.Response{StatusCode: testCase.statusCode, Header: make(http.Header)}
			response.Header.Set("Retry-After", testCase.retryAfter)
			if actual := restartHintForStatus(response); actual != testCase.expected {
				t.Fatalf("restartHintForStatus() = %q, want %q", actual, testCase.expected)
			}
		})
	}
}
