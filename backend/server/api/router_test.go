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
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/apache/incubator-devlake/core/config"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/impls/logruslog"
	"github.com/gin-gonic/gin"
	rpccode "google.golang.org/genproto/googleapis/rpc/code"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/proto"
)

// TestPluginEndpointPassesProtobufRequestBodyThrough guards the OTLP ingest contract: a
// protobuf body must reach the plugin handler unread instead of failing JSON binding.
func TestPluginEndpointPassesProtobufRequestBodyThrough(t *testing.T) {
	gin.SetMode(gin.TestMode)
	payload := []byte{0x0a, 0x02, 0x08, 0x01}
	var received []byte
	handler := func(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
		if input.Request == nil {
			return nil, errors.BadInput.New("request body was not passed through")
		}
		body, err := io.ReadAll(input.Request.Body)
		if err != nil {
			return nil, errors.Convert(err)
		}
		received = body
		return &plugin.ApiResourceOutput{Status: http.StatusOK}, nil
	}
	router := gin.New()
	basicRes := contextimpl.NewDefaultBasicRes(config.GetConfig(), logruslog.Global, nil)
	registerPluginEndpoints(router, basicRes, "claude_otel", map[string]map[string]plugin.ApiResourceHandler{
		"otlp/v1/metrics": {http.MethodPost: handler},
	})

	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/metrics", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/x-protobuf")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK || !bytes.Equal(received, payload) {
		t.Fatalf("status=%d body=%s received=%x, want 200 and %x", response.Code, response.Body.String(), received, payload)
	}
}

func TestOtlpMigrationUnavailableUsesProtobufStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)

	outputOtlpMigrationUnavailable(context, "database migration is in progress")

	status := &rpcstatus.Status{}
	if err := proto.Unmarshal(response.Body.Bytes(), status); err != nil {
		t.Fatalf("proto.Unmarshal() error = %v", err)
	}
	if response.Code != http.StatusServiceUnavailable || response.Header().Get("Content-Type") != "application/x-protobuf" || status.Code != int32(rpccode.Code_UNAVAILABLE) {
		t.Fatalf("response=%d/%q/%#v, want 503 protobuf UNAVAILABLE", response.Code, response.Header().Get("Content-Type"), status)
	}
}
