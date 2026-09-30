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

package plugin

import (
	"net"
	"net/http"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
)

// TestRemapTestConnectionStatus guards the test-connection status contract: a remote
// rejection must not surface as DevLake's own 401/404, and remote or network failures
// must be gateway errors, so they keep their message instead of the generic 500 one.
func TestRemapTestConnectionStatus(t *testing.T) {
	dnsErr := &net.DNSError{Err: "no such host", Name: "jira.invalid"}
	timeoutErr := &net.DNSError{Err: "i/o timeout", Name: "jira.invalid", IsTimeout: true}
	testCases := []struct {
		name       string
		err        errors.Error
		wantStatus int
	}{
		{"remote unauthorized", errors.HttpStatus(http.StatusUnauthorized).New("Please check your credential"), http.StatusBadRequest},
		{"remote not found", errors.NotFound.New("Seems like an invalid Endpoint URL"), http.StatusBadRequest},
		{"remote server error", errors.HttpStatus(http.StatusServiceUnavailable).New("unexpected status code: 503"), http.StatusBadGateway},
		{"unreachable host", errors.Default.Wrap(dnsErr, "Failed to resolve DNS"), http.StatusBadGateway},
		{"network timeout", errors.Default.Wrap(timeoutErr, "Failed to connect"), http.StatusGatewayTimeout},
		{"local bad input", errors.BadInput.New("Invalid URL scheme"), http.StatusBadRequest},
		{"local internal error", errors.Default.New("boom"), http.StatusInternalServerError},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			actual := remapTestConnectionStatus(testCase.err)
			if status := actual.GetType().GetHttpCode(); status != testCase.wantStatus {
				t.Fatalf("status = %d, want %d", status, testCase.wantStatus)
			}
			if actual.Messages().Get() != testCase.err.Messages().Get() {
				t.Fatalf("message = %q, want %q", actual.Messages().Get(), testCase.err.Messages().Get())
			}
		})
	}
}
