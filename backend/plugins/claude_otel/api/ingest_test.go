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
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	rpccode "google.golang.org/genproto/googleapis/rpc/code"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/proto"
)

const (
	pluginPathPrefix  = "/plugins/claude_otel/"
	ingestUnavailable = "store is down"
)

// rpcMessage is the google.rpc.Status message for a classified failure: the DevLake
// message followed by its HTTP code.
func rpcMessage(message string, status int) string {
	return fmt.Sprintf("%s (%d)", message, status)
}

func newOtlpLogsRequest() *http.Request {
	return httptest.NewRequest(http.MethodPost, pluginPathPrefix+OtlpLogsResourcePath, nil)
}

// failures collects every failed check of a test so one run reports all of them.
type failures []string

func (f *failures) check(ok bool, format string, args ...interface{}) {
	if !ok {
		*f = append(*f, fmt.Sprintf(format, args...))
	}
}

func (f failures) report(t *testing.T) {
	t.Helper()
	if len(f) > 0 {
		t.Fatal(strings.Join(f, "\n"))
	}
}

func TestPostOtlpAnswersExportResponseOnSuccess(t *testing.T) {
	request := newOtlpLogsRequest()
	var ingested *http.Request
	output, err := postOtlp(&plugin.ApiResourceInput{Request: request}, func(r *http.Request) (*service.RawIngestResult, errors.Error) {
		ingested = r
		return &service.RawIngestResult{}, nil
	}, &collectorlogs.ExportLogsServiceResponse{})
	if err != nil {
		t.Fatalf("postOtlp() error = %v", err)
	}
	var problems failures
	problems.check(ingested == request, "ingest received %p, want the input request %p", ingested, request)
	problems.check(output.Status == http.StatusOK && output.ContentType == otlpProtobufContentType,
		"postOtlp() status %d content type %q, want 200 %q", output.Status, output.ContentType, otlpProtobufContentType)
	decodeErr := proto.Unmarshal(output.Body.([]byte), &collectorlogs.ExportLogsServiceResponse{})
	problems.check(decodeErr == nil, "body is not an ExportLogsServiceResponse: %v", decodeErr)
	problems.report(t)
}

func TestPostOtlpAnswersRpcStatusOnFailure(t *testing.T) {
	tests := []struct {
		name      string
		input     *plugin.ApiResourceInput
		ingestErr errors.Error
		status    int
		code      rpccode.Code
		message   string
	}{
		{"nil input", nil, nil, http.StatusBadRequest, rpccode.Code_INVALID_ARGUMENT, exportRequestRequiredMessage},
		{"nil request", &plugin.ApiResourceInput{}, nil, http.StatusBadRequest, rpccode.Code_INVALID_ARGUMENT, exportRequestRequiredMessage},
		{"unavailable", &plugin.ApiResourceInput{Request: newOtlpLogsRequest()}, errors.Unavailable.New(ingestUnavailable), http.StatusServiceUnavailable, rpccode.Code_UNAVAILABLE, ingestUnavailable},
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
			problems := otlpStatusFailures(output, test.status, test.code, rpcMessage(test.message, test.status))
			problems.check(called == (test.ingestErr != nil), "ingest called = %t, want %t", called, test.ingestErr != nil)
			problems.report(t)
		})
	}
}

func TestPostOtlpLogsWithoutIngestServiceIsUnavailable(t *testing.T) {
	output, err := PostOtlpLogs(&plugin.ApiResourceInput{Request: newOtlpLogsRequest()})
	if err != nil {
		t.Fatalf("PostOtlpLogs() error = %v", err)
	}
	status := http.StatusServiceUnavailable
	otlpStatusFailures(output, status, rpccode.Code_UNAVAILABLE, rpcMessage(ingestServiceUnavailableMessage, status)).report(t)
}

// otlpStatusFailures checks that output is a protobuf google.rpc.Status with the given HTTP
// status, rpc code and message.
func otlpStatusFailures(output *plugin.ApiResourceOutput, status int, code rpccode.Code, message string) failures {
	var problems failures
	problems.check(output.Status == status && output.ContentType == otlpProtobufContentType,
		"status %d content type %q, want %d %q", output.Status, output.ContentType, status, otlpProtobufContentType)
	body := &rpcstatus.Status{}
	if err := proto.Unmarshal(output.Body.([]byte), body); err != nil {
		problems.check(false, "body is not a google.rpc.Status: %v", err)
		return problems
	}
	problems.check(body.Code == int32(code) && body.Message == message,
		"rpc status = %v %q, want %v %q", rpccode.Code(body.Code), body.Message, code, message)
	return problems
}
