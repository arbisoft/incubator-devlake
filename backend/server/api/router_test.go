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
	"encoding/json"
	goerrors "errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/apache/incubator-devlake/core/config"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/impls/logruslog"
	"github.com/apache/incubator-devlake/server/api/access"
	"github.com/apache/incubator-devlake/server/api/shared"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	rpccode "google.golang.org/genproto/googleapis/rpc/code"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/proto"
)

// TestMain gives every test in this package a deterministic, single access.Init call.
// access.Init is guarded by a package-level sync.Once, so whichever test called it first
// would otherwise decide access.Default()'s configuration for the rest of the binary,
// with later tests' t.Setenv restoring the environment variable but not that already-set
// state. Doing it once, here, makes the ordering explicit instead of convention-dependent.
func TestMain(m *testing.M) {
	if err := os.Setenv("AUTH_ACCESS_ENABLED", "true"); err != nil {
		panic(err)
	}
	access.Init(contextimpl.NewDefaultBasicRes(config.GetConfig(), logruslog.Global, nil))
	os.Exit(m.Run())
}

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

// TestPluginEndpointComputesIsCustomerAdminFromAccessPrincipal guards handlePluginCall's
// role check (router.go), the part of the customer-administrator boundary that the
// handler-level tests in each plugin cannot see: only this wiring decides which
// principal reaches input.IsCustomerAdmin in the first place.
func TestPluginEndpointComputesIsCustomerAdminFromAccessPrincipal(t *testing.T) {
	gin.SetMode(gin.TestMode)
	// TestMain, above, initializes access.Default() with AUTH_ACCESS_ENABLED=true once
	// for the whole package; this guard fails loudly if that premise is ever broken,
	// instead of silently asserting nothing below.
	if !access.Default().Enabled() {
		t.Fatal("access.Default().Enabled() = false; want true (TestMain sets AUTH_ACCESS_ENABLED=true)")
	}
	basicRes := contextimpl.NewDefaultBasicRes(config.GetConfig(), logruslog.Global, nil)

	testCases := []struct {
		name      string
		principal *access.Principal
		want      bool
	}{
		{name: "no principal is not customer admin", principal: nil, want: false},
		{name: "member is not customer admin", principal: &access.Principal{Role: access.RoleMember}, want: false},
		{name: "customer admin is customer admin", principal: &access.Principal{Role: access.RoleCustomerAdmin}, want: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var handlerCalled bool
			var gotIsCustomerAdmin bool
			handler := func(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
				handlerCalled = true
				gotIsCustomerAdmin = input.IsCustomerAdmin
				return &plugin.ApiResourceOutput{Status: http.StatusOK}, nil
			}

			router := gin.New()
			if testCase.principal != nil {
				principal := testCase.principal
				router.Use(func(c *gin.Context) {
					access.SetPrincipal(c, principal)
					c.Next()
				})
			}
			registerPluginEndpoints(router, basicRes, "claude_otel", map[string]map[string]plugin.ApiResourceHandler{
				"probe": {http.MethodGet: handler},
			})

			request := httptest.NewRequest(http.MethodGet, "/plugins/claude_otel/probe", nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)

			if !handlerCalled {
				t.Fatalf("handler was not reached, status=%d body=%s", response.Code, response.Body.String())
			}
			if gotIsCustomerAdmin != testCase.want {
				t.Fatalf("IsCustomerAdmin = %t, want %t", gotIsCustomerAdmin, testCase.want)
			}
		})
	}
}

// TestPluginEndpointErrorBodyIsClientSafe guards the error contract every plugin
// endpoint shares: the status comes from the error's classification, the message is
// the top-level one without the errors package's " (409)" suffix, and neither the
// wrap chain nor the helpers' err.Error() rendering reaches the client.
func TestPluginEndpointErrorBodyIsClientSafe(t *testing.T) {
	gin.SetMode(gin.TestMode)
	validationErr := validator.New().Struct(struct {
		Endpoint string `validate:"required"`
	}{})
	conflict := errors.Conflict.New("Cannot delete the connection because it is referenced by blueprints")
	testCases := []struct {
		name        string
		handler     plugin.ApiResourceHandler
		body        string
		wantStatus  int
		wantMessage string
		wantData    bool
	}{
		{
			name: "helper-built conflict body keeps its data",
			handler: func(*plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
				return &plugin.ApiResourceOutput{Body: &shared.ApiBody{
					Message: conflict.Error(),
					Data:    []string{"blueprint-1"},
				}, Status: http.StatusConflict}, conflict
			},
			wantStatus:  http.StatusConflict,
			wantMessage: "Cannot delete the connection because it is referenced by blueprints",
			wantData:    true,
		},
		{
			name: "wrap chain is not exposed",
			handler: func(*plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
				return nil, errors.Default.Wrap(errors.NotFound.New("record not found"), "connection not found")
			},
			wantStatus:  http.StatusNotFound,
			wantMessage: "connection not found",
		},
		{
			name: "untyped validation error is a bad request",
			handler: func(*plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
				return nil, errors.Convert(validationErr)
			},
			wantStatus:  http.StatusBadRequest,
			wantMessage: "Endpoint is required",
		},
		{
			name: "internal error text is not exposed",
			handler: func(*plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
				return nil, errors.Convert(goerrors.New("Error 1146: Table 'lake.x' doesn't exist"))
			},
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "an unexpected error occurred",
		},
		{
			name: "malformed JSON body is a bad request",
			handler: func(*plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
				return nil, nil
			},
			body:        "{",
			wantStatus:  http.StatusBadRequest,
			wantMessage: shared.BadRequestBody,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			router := gin.New()
			basicRes := contextimpl.NewDefaultBasicRes(config.GetConfig(), logruslog.Global, nil)
			registerPluginEndpoints(router, basicRes, "github", map[string]map[string]plugin.ApiResourceHandler{
				"probe": {http.MethodPost: testCase.handler},
			})
			request := httptest.NewRequest(http.MethodPost, "/plugins/github/probe", strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)

			var body map[string]any
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatalf("body %q is not JSON: %v", response.Body.String(), err)
			}
			if response.Code != testCase.wantStatus || body["message"] != testCase.wantMessage || body["causes"] != nil ||
				(body["data"] != nil) != testCase.wantData {
				t.Fatalf("status=%d body=%s, want %d with message %q, no causes, data=%t",
					response.Code, response.Body.String(), testCase.wantStatus, testCase.wantMessage, testCase.wantData)
			}
		})
	}
}
