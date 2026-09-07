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

	"github.com/apache/incubator-devlake/core/config"
	coremodels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/helpers/apikeyhelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/impls/logruslog"
	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/server/api/shared"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/mock"
)

// requireUserGate simulates RequireAuth with AUTH_ENABLED=true: it rejects any
// request whose gin context does not carry an authenticated user. This is the
// exact check that caused 401s for valid REST API key requests.
func requireUserGate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := shared.GetUser(c); !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "unauthorized",
			})
			return
		}
		c.Next()
	}
}

// TestRestAuthKeyReachesHandlerWhenAuthEnabled sends a valid /rest/... Bearer
// token request through a router that also has a RequireAuth-style gate. The
// request must reach the downstream handler (200) rather than being rejected
// by the auth gate (401).
//
// Without the fix, gin's HandleContext resets c.Keys, wiping the user that
// RestAuthentication stored before rerouting, so the auth gate sees no user
// and returns 401.
func TestRestAuthKeyReachesHandlerWhenAuthEnabled(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// apikeyhelper reads ENCRYPTION_SECRET from the global viper config.
	const encryptionSecret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // 32 bytes
	config.GetConfig().Set("ENCRYPTION_SECRET", encryptionSecret)
	config.GetConfig().Set("FORWARDED_USER_SECRET", "shared-secret")
	t.Cleanup(func() { config.GetConfig().Set("FORWARDED_USER_SECRET", "") })

	basicRes := contextimpl.NewDefaultBasicRes(config.GetConfig(), logruslog.Global, nil)
	helper := apikeyhelper.NewApiKeyHelper(basicRes, logruslog.Global)

	const plaintext = "test-api-key-plaintext"
	hashedKey, hashErr := helper.DigestToken(plaintext)
	if hashErr != nil {
		t.Fatalf("DigestToken: %v", hashErr)
	}

	// Mock DAL: when First is called, populate the destination with a valid key
	// whose AllowedPath covers the webhook endpoint under test.
	db := &mockdal.Dal{}
	db.On("First", mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			dst := args.Get(0).(*coremodels.ApiKey)
			dst.ApiKey = hashedKey
			dst.AllowedPath = `/plugins/webhook/connections/1/.*`
			dst.Creator = common.Creator{Creator: "test-user", CreatorEmail: "test-user@example.com"}
		}).
		Return(nil)

	basicRes = contextimpl.NewDefaultBasicRes(config.GetConfig(), logruslog.Global, db)

	router := gin.New()
	router.Use(RestAuthentication(router, basicRes))
	router.Use(OAuth2ProxyAuthentication(basicRes))
	router.Use(requireUserGate())
	router.POST("/plugins/webhook/connections/:id/deployments", func(c *gin.Context) {
		user, ok := shared.GetUser(c)
		if !ok {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		c.String(http.StatusOK, user.Email)
	})

	req := httptest.NewRequest(http.MethodPost, "/rest/plugins/webhook/connections/1/deployments", nil)
	req.Header.Set("Authorization", "Bearer "+plaintext)
	req.Header.Set(forwardedUserHeader, "proxy-user")
	req.Header.Set(forwardedEmailHeader, "proxy@example.com")
	req.Header.Set(forwardedUserSecretHeader, "shared-secret")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200 with valid REST API key when auth gate is active, got %d: %s",
			resp.Code, resp.Body.String())
	}
	if got := resp.Body.String(); got != "test-user@example.com" {
		t.Fatalf("expected REST API-key identity to survive rerouting, got %q", got)
	}
}

// TestRestAuthPercentEncodedPathReachesHandler covers the RawPath half of the
// /rest rewrite: with UseRawPath=true, gin re-routes HandleContext on RawPath
// whenever it is set.
//
// net/url sets RawPath only when the caller's escaping differs from its own
// encodePath output -- true for %40 and %2F below, false for %20, which Go
// escapes identically and so exercises the other branch.
//
// Without the fix, only URL.Path was rewritten, leaving RawPath prefixed with
// /rest so the replay 404'd. The dashboard builds its path with
// encodeURIComponent, so the proxy sends exactly these escapes.
func TestRestAuthPercentEncodedPathReachesHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const encryptionSecret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // 32 bytes
	config.GetConfig().Set("ENCRYPTION_SECRET", encryptionSecret)

	basicRes := contextimpl.NewDefaultBasicRes(config.GetConfig(), logruslog.Global, nil)
	helper := apikeyhelper.NewApiKeyHelper(basicRes, logruslog.Global)

	const plaintext = "test-api-key-plaintext"
	hashedKey, hashErr := helper.DigestToken(plaintext)
	if hashErr != nil {
		t.Fatalf("DigestToken: %v", hashErr)
	}

	cases := []struct {
		name      string
		method    string
		requested string
		// want is "<userLogin>|<projectName>" as echoed by the handlers below.
		want string
	}{
		{
			name:      "email login, %40 sets RawPath",
			method:    http.MethodPost,
			requested: "/rest/user-project-mappings/test%40arbisoft.com",
			want:      "test@arbisoft.com|",
		},
		{
			name:      "encoded slash in project name, %2F sets RawPath",
			method:    http.MethodDelete,
			requested: "/rest/user-project-mappings/test%40arbisoft.com/Data%2FPlatform",
			want:      "test@arbisoft.com|Data/Platform",
		},
		{
			name:      "space leaves RawPath empty, must still route",
			method:    http.MethodDelete,
			requested: "/rest/user-project-mappings/alice/Data%20Platform",
			want:      "alice|Data Platform",
		},
		{
			name:      "unescaped path still works",
			method:    http.MethodPost,
			requested: "/rest/user-project-mappings/alice",
			want:      "alice|",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := &mockdal.Dal{}
			db.On("First", mock.Anything, mock.Anything).
				Run(func(args mock.Arguments) {
					dst := args.Get(0).(*coremodels.ApiKey)
					dst.ApiKey = hashedKey
					dst.AllowedPath = `^/user-project-mappings(/.*)?$`
					dst.Creator = common.Creator{Creator: "test-user", CreatorEmail: "test-user@example.com"}
				}).
				Return(nil)

			res := contextimpl.NewDefaultBasicRes(config.GetConfig(), logruslog.Global, db)

			router := gin.New()
			// Mirrors SetupApiServer; this is what makes gin route on RawPath.
			router.UseRawPath = true
			router.Use(RestAuthentication(router, res))
			router.Use(requireUserGate())

			echo := func(c *gin.Context) {
				c.String(http.StatusOK, c.Param("userLogin")+"|"+c.Param("projectName"))
			}
			router.POST("/user-project-mappings/:userLogin", echo)
			router.DELETE("/user-project-mappings/:userLogin/:projectName", echo)

			req := httptest.NewRequest(tc.method, tc.requested, nil)
			req.Header.Set("Authorization", "Bearer "+plaintext)
			resp := httptest.NewRecorder()
			router.ServeHTTP(resp, req)

			if resp.Code != http.StatusOK {
				t.Fatalf("expected 200 for %s, got %d: %s", tc.requested, resp.Code, resp.Body.String())
			}
			if got := resp.Body.String(); got != tc.want {
				t.Fatalf("expected params %q, got %q", tc.want, got)
			}
		})
	}
}
