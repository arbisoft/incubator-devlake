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
	"net/http"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	rpccode "google.golang.org/genproto/googleapis/rpc/code"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/proto"
)

func decodeOtlpStatus(t *testing.T, output *plugin.ApiResourceOutput) *rpcstatus.Status {
	t.Helper()
	if output.ContentType != otlpProtobufContentType {
		t.Fatalf("ContentType = %q, want %q", output.ContentType, otlpProtobufContentType)
	}
	status := &rpcstatus.Status{}
	if err := proto.Unmarshal(output.Body.([]byte), status); err != nil {
		t.Fatalf("response body is not an OTLP status: %v", err)
	}
	return status
}

// Without an initialized ingest service the Collector must get a retryable 503.
func TestPostOtlpLogsIsUnavailableWithoutIngestService(t *testing.T) {
	output, err := PostOtlpLogs(&plugin.ApiResourceInput{Request: &http.Request{}})
	if err != nil || output.Status != http.StatusServiceUnavailable {
		t.Fatalf("PostOtlpLogs() = %+v, %v, want HTTP 503", output, err)
	}
	if status := decodeOtlpStatus(t, output); status.Code != int32(rpccode.Code_UNAVAILABLE) {
		t.Fatalf("status code = %d, want UNAVAILABLE", status.Code)
	}
}

func TestOtlpErrorOutputMapsStatusesForTheCollector(t *testing.T) {
	for _, testCase := range []struct {
		err        errors.Error
		httpStatus int
		code       rpccode.Code
	}{
		{errors.BadInput.New("bad payload"), http.StatusBadRequest, rpccode.Code_INVALID_ARGUMENT},
		{errors.Unauthorized.New("no token"), http.StatusUnauthorized, rpccode.Code_UNAUTHENTICATED},
		{errors.Forbidden.New("wrong token"), http.StatusForbidden, rpccode.Code_PERMISSION_DENIED},
		{errors.HttpStatus(http.StatusRequestEntityTooLarge).New("too large"), http.StatusRequestEntityTooLarge, rpccode.Code_INVALID_ARGUMENT},
		{errors.HttpStatus(http.StatusUnsupportedMediaType).New("json"), http.StatusUnsupportedMediaType, rpccode.Code_INVALID_ARGUMENT},
		{errors.Unavailable.New("storage down"), http.StatusServiceUnavailable, rpccode.Code_UNAVAILABLE},
		// Unmapped statuses become a 500 rather than leaking an unexpected code.
		{errors.Conflict.New("conflict"), http.StatusInternalServerError, rpccode.Code_INTERNAL},
	} {
		output, err := otlpErrorOutput(testCase.err)
		if err != nil || output.Status != testCase.httpStatus {
			t.Errorf("otlpErrorOutput(%v) = %+v, %v, want HTTP %d", testCase.err, output, err, testCase.httpStatus)
			continue
		}
		status := decodeOtlpStatus(t, output)
		if status.Code != int32(testCase.code) || status.Message != testCase.err.Messages().Get() {
			t.Errorf("otlpErrorOutput(%v) status = %d %q, want %d", testCase.err, status.Code, status.Message, testCase.code)
		}
	}
}
