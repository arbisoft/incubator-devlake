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

import (
	"fmt"
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
)

func normalizeOIDCProviderInput(input OIDCProviderInput) (*OIDCProvider, string, errors.Error) {
	providerKey := strings.ToLower(strings.TrimSpace(input.ProviderKey))
	issuerURL := strings.TrimRight(strings.TrimSpace(input.IssuerURL), "/")
	clientID := strings.TrimSpace(input.ClientID)
	displayName := strings.TrimSpace(input.DisplayName)
	scopes := normalizeOIDCScopes(input.Scopes)
	if !validOIDCProviderKey(providerKey) || issuerURL == "" || clientID == "" || displayName == "" || scopes == "" {
		return nil, "", errors.BadInput.New("provide valid OIDC provider settings", errors.WithData(ErrCodeInvalidProvider))
	}
	return &OIDCProvider{ProviderKey: providerKey, DisplayName: displayName, IssuerURL: issuerURL, ClientID: clientID, Scopes: scopes}, strings.TrimSpace(input.ClientSecret), nil
}

func validOIDCProviderKey(value string) bool {
	if len(value) == 0 || len(value) > 64 {
		return false
	}
	for _, character := range value {
		if !(character >= 'a' && character <= 'z') && !(character >= '0' && character <= '9') && character != '-' && character != '_' {
			return false
		}
	}
	return true
}

func normalizeOIDCScopes(raw string) string {
	seen := make(map[string]struct{})
	ordered := make([]string, 0)
	for _, scope := range strings.FieldsFunc(raw, func(character rune) bool { return character == ',' || character == ' ' }) {
		scope = strings.TrimSpace(scope)
		if scope == "" {
			continue
		}
		if _, ok := seen[scope]; ok {
			continue
		}
		seen[scope] = struct{}{}
		ordered = append(ordered, scope)
	}
	if _, ok := seen["openid"]; !ok {
		return ""
	}
	return strings.Join(ordered, " ")
}

func oidcProviderResponse(provider *OIDCProvider, configuration *OIDCProviderConfiguration) *OIDCProviderResponse {
	return &OIDCProviderResponse{
		ProviderKey: provider.ProviderKey, DisplayName: provider.DisplayName, IssuerURL: provider.IssuerURL,
		ClientID: provider.ClientID, Scopes: provider.Scopes, Enabled: provider.Enabled, RetiredAt: provider.RetiredAt,
		SecretConfigured:     hasOIDCProviderSecret(provider),
		DatabaseSourceActive: configuration.ActivatedAt != nil, GrafanaSyncStatus: configuration.GrafanaSyncStatus,
		GrafanaSyncedRevision: configuration.GrafanaSyncedRevision, ProviderRevision: configuration.ProviderRevision,
	}
}

func hasOIDCProviderSecret(provider *OIDCProvider) bool {
	return provider != nil && len(provider.EncryptedClientSecret) > 0 && len(provider.ClientSecretNonce) > 0 && provider.ClientSecretKeyID != ""
}

func providerAuditDetail(providerKey string) string { return fmt.Sprintf("provider=%s", providerKey) }
