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
	"fmt"
	"strings"

	"github.com/apache/incubator-devlake/core/context"
)

const (
	authLocalEnabledConfig           = "AUTH_LOCAL_ENABLED"
	authLocalBootstrapUsernameConfig = "AUTH_LOCAL_BOOTSTRAP_USERNAME"
	authLocalBootstrapPasswordConfig = "AUTH_LOCAL_BOOTSTRAP_PASSWORD"
	authLocalRateLimitKeyConfig      = "AUTH_LOCAL_RATE_LIMIT_KEY"
)

type localAuthConfig struct {
	Enabled           bool
	BootstrapUsername string
	BootstrapPassword string
	RateLimitKey      []byte
}

func loadLocalAuthConfig(basicRes context.BasicRes, authEnabled bool) (*localAuthConfig, error) {
	config := basicRes.GetConfigReader()
	local := &localAuthConfig{Enabled: config.GetBool(authLocalEnabledConfig)}
	if !local.Enabled {
		return local, nil
	}
	if !authEnabled {
		return nil, fmt.Errorf("AUTH_LOCAL_ENABLED=true requires AUTH_ENABLED=true")
	}

	username := strings.TrimSpace(config.GetString(authLocalBootstrapUsernameConfig))
	password := config.GetString(authLocalBootstrapPasswordConfig)
	if (username == "") != (password == "") {
		return nil, fmt.Errorf("%s and %s must be set together", authLocalBootstrapUsernameConfig, authLocalBootstrapPasswordConfig)
	}
	if username != "" {
		normalized, err := normalizeLocalUsername(username)
		if err != nil {
			return nil, fmt.Errorf("invalid %s: %w", authLocalBootstrapUsernameConfig, err)
		}
		if err := validateLocalPassword(password); err != nil {
			return nil, fmt.Errorf("invalid %s: %w", authLocalBootstrapPasswordConfig, err)
		}
		local.BootstrapUsername = normalized
		local.BootstrapPassword = password
	}

	rateLimitKey := []byte(config.GetString(authLocalRateLimitKeyConfig))
	if len(rateLimitKey) < localLoginRateLimitKeyMinimumBytes {
		return nil, fmt.Errorf("%s must be at least %d bytes", authLocalRateLimitKeyConfig, localLoginRateLimitKeyMinimumBytes)
	}
	local.RateLimitKey = rateLimitKey
	return local, nil
}
