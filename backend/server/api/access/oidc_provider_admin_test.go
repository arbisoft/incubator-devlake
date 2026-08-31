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

func TestNormalizeOIDCProviderInput(t *testing.T) {
	testCases := []struct {
		name      string
		input     OIDCProviderInput
		wantKey   string
		wantScope string
		wantError bool
	}{
		{
			name: "normalizes provider settings",
			input: OIDCProviderInput{
				ProviderKey: "  Google-Workspace ", DisplayName: " Google ", IssuerURL: "https://accounts.example.com/ ",
				ClientID: " client ", ClientSecret: " secret ", Scopes: "openid, profile openid email",
			},
			wantKey: "google-workspace", wantScope: "openid profile email",
		},
		{
			name:      "rejects missing openid scope",
			input:     OIDCProviderInput{ProviderKey: "google", DisplayName: "Google", IssuerURL: "https://accounts.example.com", ClientID: "client", Scopes: "profile email"},
			wantError: true,
		},
		{
			name:      "rejects unsafe provider key",
			input:     OIDCProviderInput{ProviderKey: "google/oidc", DisplayName: "Google", IssuerURL: "https://accounts.example.com", ClientID: "client", Scopes: "openid"},
			wantError: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			provider, _, err := normalizeOIDCProviderInput(testCase.input)
			if (err != nil) != testCase.wantError {
				t.Fatalf("normalizeOIDCProviderInput() error = %v, wantError %t", err, testCase.wantError)
			}
			if err == nil && (provider.ProviderKey != testCase.wantKey || provider.Scopes != testCase.wantScope) {
				t.Fatalf("provider = %#v, want key=%q scopes=%q", provider, testCase.wantKey, testCase.wantScope)
			}
		})
	}
}

func TestOIDCProviderResponseDoesNotExposeSecret(t *testing.T) {
	provider := &OIDCProvider{
		ProviderKey: "google", EncryptedClientSecret: []byte("ciphertext"), ClientSecretNonce: []byte("nonce"), ClientSecretKeyID: "key-1",
	}
	response := oidcProviderResponse(provider, &OIDCProviderConfiguration{})
	if !response.SecretConfigured {
		t.Fatal("response should report configured secret")
	}
}
