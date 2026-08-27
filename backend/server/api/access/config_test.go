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

package access

import "testing"

func TestValidateConfiguration(t *testing.T) {
	testCases := []struct {
		name                string
		authEnabled         bool
		oidcEnabled         bool
		forwardedUserSecret string
		wantError           bool
	}{
		{name: "native OIDC", authEnabled: true, oidcEnabled: true},
		{name: "whitespace only", authEnabled: true, oidcEnabled: true, forwardedUserSecret: " \t\n"},
		{name: "auth disabled", oidcEnabled: true, wantError: true},
		{name: "OIDC disabled", authEnabled: true, wantError: true},
		{name: "forwarded secret configured", authEnabled: true, oidcEnabled: true, forwardedUserSecret: "shared-secret", wantError: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := ValidateConfiguration(testCase.authEnabled, testCase.oidcEnabled, testCase.forwardedUserSecret)
			if (err != nil) != testCase.wantError {
				t.Fatalf("ValidateConfiguration() error = %v, wantError %v", err, testCase.wantError)
			}
		})
	}
}
