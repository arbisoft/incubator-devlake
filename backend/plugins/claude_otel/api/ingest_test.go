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
	"net/http/httptest"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	rpccode "google.golang.org/genproto/googleapis/rpc/code"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/proto"
)

func TestPostOtlpAnswersExportResponseOnSuccess(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/"+OtlpLogsResourcePath, nil)
	var ingested *http.Request
	output, err := postOtlp(&plugin.ApiResourceInput{Request: request}, func(r *http.Request) (*service.RawIngestResult, errors.Error) {
		ingested = r
		return &service.RawIngestResult{}, nil
	}, &collectorlogs.ExportLogsServiceResponse{})
	if err != nil {
		t.Fatalf("postOtlp() error = %v", err)
	}
	if ingested != request {
		t.Fatalf("ingest received %p, want the input request %p", ingested, request)
	}
	if output.Status != http.StatusOK || output.ContentType != otlpProtobufContentType {
		t.Fatalf("postOtlp() status %d content type %q, want 200 %q", output.Status, output.ContentType, otlpProtobufContentType)
	}
	if err := proto.Unmarshal(output.Body.([]byte), &collectorlogs.ExportLogsServiceResponse{}); err != nil {
		t.Fatalf("body is not an ExportLogsServiceResponse: %v", err)
	}
}

// The rpc status message is the classified DevLake message, which ends with the HTTP code.
func TestPostOtlpAnswersRpcStatusOnFailure(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/"+OtlpLogsResourcePath, nil)
	tests := []struct {
		name      string
		input     *plugin.ApiResourceInput
		ingestErr errors.Error
		status    int
		code      rpccode.Code
		message   string
	}{
		{"nil input", nil, nil, http.StatusBadRequest, rpccode.Code_INVALID_ARGUMENT, "OTLP export request is required (400)"},
		{"nil request", &plugin.ApiResourceInput{}, nil, http.StatusBadRequest, rpccode.Code_INVALID_ARGUMENT, "OTLP export request is required (400)"},
		{"unavailable", &plugin.ApiResourceInput{Request: request}, errors.Unavailable.New("store is down"), http.StatusServiceUnavailable, rpccode.Code_UNAVAILABLE, "store is down (503)"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			called := false
			output, err := postOtlp(test.input, func(*http.Request) (*service.RawIngestResult, errors.Error) {
				called = true
				return nil, test.ingestErr
			}, &collectorlogs.ExportLogsServiceResponse{})
			if err != nil {
				t.Fatalf("postOtlp() error = %v", err)
			}
			if called != (test.ingestErr != nil) {
				t.Fatalf("ingest called = %t, want %t", called, test.ingestErr != nil)
			}
			assertOtlpStatus(t, output, test.status, test.code, test.message)
		})
	}
}

func TestPostOtlpLogsWithoutIngestServiceIsUnavailable(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/"+OtlpLogsResourcePath, nil)
	output, err := PostOtlpLogs(&plugin.ApiResourceInput{Request: request})
	if err != nil {
		t.Fatalf("PostOtlpLogs() error = %v", err)
	}
	assertOtlpStatus(t, output, http.StatusServiceUnavailable, rpccode.Code_UNAVAILABLE, "Claude Code OTel ingest service is unavailable (503)")
}

func assertOtlpStatus(t *testing.T, output *plugin.ApiResourceOutput, status int, code rpccode.Code, message string) {
	t.Helper()
	if output.Status != status || output.ContentType != otlpProtobufContentType {
		t.Fatalf("status %d content type %q, want %d %q", output.Status, output.ContentType, status, otlpProtobufContentType)
	}
	body := &rpcstatus.Status{}
	if err := proto.Unmarshal(output.Body.([]byte), body); err != nil {
		t.Fatalf("body is not a google.rpc.Status: %v", err)
	}
	if body.Code != int32(code) || body.Message != message {
		t.Fatalf("rpc status = %v %q, want %v %q", rpccode.Code(body.Code), body.Message, code, message)
	}
}
