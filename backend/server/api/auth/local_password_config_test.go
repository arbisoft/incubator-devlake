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

package auth

import (
	"strings"
	"testing"

	"github.com/spf13/viper"

	"github.com/apache/incubator-devlake/helpers/unithelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
)

func TestLoadLocalAuthConfig(t *testing.T) {
	testCases := []struct {
		name        string
		authEnabled bool
		configure   func(*viper.Viper)
		wantError   string
	}{
		{name: "disabled remains inert"},
		{
			name:        "requires native auth",
			authEnabled: false,
			configure: func(config *viper.Viper) {
				config.Set(authLocalEnabledConfig, true)
			},
			wantError: "requires AUTH_ENABLED",
		},
		{
			name:        "requires rate limit key",
			authEnabled: true,
			configure: func(config *viper.Viper) {
				config.Set(authLocalEnabledConfig, true)
			},
			wantError: authLocalRateLimitKeyConfig,
		},
		{
			name:        "bootstrap values must be paired",
			authEnabled: true,
			configure: func(config *viper.Viper) {
				config.Set(authLocalEnabledConfig, true)
				config.Set(authLocalRateLimitKeyConfig, strings.Repeat("k", 32))
				config.Set(authLocalBootstrapUsernameConfig, "admin")
			},
			wantError: "must be set together",
		},
		{
			name:        "normalizes valid bootstrap username",
			authEnabled: true,
			configure: func(config *viper.Viper) {
				config.Set(authLocalEnabledConfig, true)
				config.Set(authLocalRateLimitKeyConfig, strings.Repeat("k", 32))
				config.Set(authLocalBootstrapUsernameConfig, " Admin ")
				config.Set(authLocalBootstrapPasswordConfig, "a secure bootstrap password")
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			config := viper.New()
			if testCase.configure != nil {
				testCase.configure(config)
			}
			basicRes := contextimpl.NewDefaultBasicRes(config, unithelper.DummyLogger(), nil)
			local, err := loadLocalAuthConfig(basicRes, testCase.authEnabled)
			if testCase.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), testCase.wantError) {
					t.Fatalf("loadLocalAuthConfig() error = %v, want %q", err, testCase.wantError)
				}
				return
			}
			if err != nil {
				t.Fatalf("loadLocalAuthConfig() error = %v", err)
			}
			if testCase.name == "normalizes valid bootstrap username" && local.BootstrapUsername != "admin" {
				t.Fatalf("BootstrapUsername = %q, want admin", local.BootstrapUsername)
			}
		})
	}
}
