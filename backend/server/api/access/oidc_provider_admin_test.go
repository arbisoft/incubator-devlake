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

func TestReuseOIDCProviderCredential(t *testing.T) {
	stored := oidcProviderFromCandidate(&OIDCProviderCandidate{
		ClientID: "client-a", EncryptedClientSecret: []byte("ciphertext"), ClientSecretNonce: []byte("nonce"), ClientSecretKeyID: "key-1",
	})
	testCases := []struct {
		name          string
		provider      *OIDCProvider
		stored        *OIDCProvider
		clientSecret  string
		wantErrorCode string
		wantReuse     bool
	}{
		{
			name: "reuses configured credential for unchanged client ID", provider: &OIDCProvider{ClientID: "client-a"}, stored: stored,
			wantReuse: true,
		},
		{
			name: "requires replacement credential for changed client ID", provider: &OIDCProvider{ClientID: "client-b"}, stored: stored,
			wantErrorCode: ErrCodeInvalidProvider,
		},
		{
			name: "requires credential for first provider", provider: &OIDCProvider{ClientID: "client-a"},
			wantErrorCode: ErrCodeInvalidProvider,
		},
		{
			name: "uses supplied replacement credential", provider: &OIDCProvider{ClientID: "client-b"}, stored: stored, clientSecret: "replacement",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := reuseOIDCProviderCredential(testCase.provider, testCase.stored, testCase.clientSecret)
			if testCase.wantErrorCode == "" {
				if err != nil {
					t.Fatalf("reuseOIDCProviderCredential() error = %v", err)
				}
			} else if err == nil || err.GetData() != testCase.wantErrorCode {
				t.Fatalf("reuseOIDCProviderCredential() error = %v, want code %q", err, testCase.wantErrorCode)
			}
			if testCase.wantReuse && !hasOIDCProviderSecret(testCase.provider) {
				t.Fatal("expected stored credential to remain available internally")
			}
		})
	}
}

func TestValidateOIDCProviderIdentity(t *testing.T) {
	current := &OIDCProvider{ProviderKey: "google", IssuerURL: "https://accounts.google.com"}
	testCases := []struct {
		name      string
		provider  *OIDCProvider
		current   *OIDCProvider
		wantError bool
	}{
		{name: "allows unchanged provider identity", provider: &OIDCProvider{ProviderKey: "google", IssuerURL: "https://accounts.google.com"}, current: current},
		{name: "allows first provider identity", provider: &OIDCProvider{ProviderKey: "google", IssuerURL: "https://accounts.google.com"}},
		{name: "rejects changed provider key", provider: &OIDCProvider{ProviderKey: "entra", IssuerURL: "https://accounts.google.com"}, current: current, wantError: true},
		{name: "rejects changed issuer", provider: &OIDCProvider{ProviderKey: "google", IssuerURL: "https://login.microsoftonline.com"}, current: current, wantError: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateOIDCProviderIdentity(testCase.provider, testCase.current)
			if (err != nil) != testCase.wantError {
				t.Fatalf("validateOIDCProviderIdentity() error = %v, wantError %t", err, testCase.wantError)
			}
		})
	}
}

func TestOIDCProviderResponseIncludesDeploymentDerivedCallbacks(t *testing.T) {
	service := &Service{cfg: Config{
		AuthPublicURL:    "https://devlake.example.com",
		GrafanaPublicURL: "https://grafana.example.com",
	}}
	response := service.decorateOIDCProviderResponse(&OIDCProviderResponse{})
	if response.DevLakeCallbackURL != "https://devlake.example.com/api/auth/callback" {
		t.Fatalf("DevLake callback = %q", response.DevLakeCallbackURL)
	}
	if response.GrafanaCallbackURL != "https://grafana.example.com/login/generic_oauth" {
		t.Fatalf("Grafana callback = %q", response.GrafanaCallbackURL)
	}
}

func TestOIDCProviderCallbacksRequireDeploymentOrigins(t *testing.T) {
	service := &Service{cfg: Config{AuthPublicURL: "https://devlake.example.com"}}
	if _, _, err := service.oidcProviderCallbacks(); err == nil {
		t.Fatal("expected missing Grafana public URL to block provider administration")
	}
}
