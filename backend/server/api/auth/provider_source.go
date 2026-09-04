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
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/helpers/oidchelper"
	"github.com/apache/incubator-devlake/server/api/access"
)

// providerSourceReadError identifies a transient failure while reading the
// database source. Callers can retain a last-known-good runtime configuration
// for this error while failing closed for a confirmed invalid source.
type providerSourceReadError struct {
	cause error
}

func (e *providerSourceReadError) Error() string { return e.cause.Error() }
func (e *providerSourceReadError) Unwrap() error { return e.cause }

const (
	oidcCredentialKeyIDConfig         = "AUTH_OIDC_CREDENTIAL_KEY_ID"
	oidcCredentialKeyConfig           = "AUTH_OIDC_CREDENTIAL_KEY"
	oidcCredentialPreviousKeyIDConfig = "AUTH_OIDC_CREDENTIAL_PREVIOUS_KEY_ID"
	oidcCredentialPreviousKeyConfig   = "AUTH_OIDC_CREDENTIAL_PREVIOUS_KEY"
)

// loadProviderSource preserves environment providers until the activation record
// exists. Once present, it rejects a missing/invalid database provider instead of
// silently falling back to environment credentials.
func loadProviderSource(cfg *oidchelper.Config, db dal.Dal, config context.BasicRes) (*oidchelper.Config, CredentialProtector, error) {
	provider, databaseSource, err := access.LoadDatabaseOIDCProvider(db)
	if err != nil {
		return nil, nil, &providerSourceReadError{cause: fmt.Errorf("load database OIDC provider: %w", err)}
	}
	if !databaseSource {
		return cfg, nil, nil
	}
	protector, loadErr := loadCredentialProtector(config)
	if loadErr != nil {
		return nil, nil, loadErr
	}
	if provider == nil {
		return nil, nil, fmt.Errorf("database OIDC source is active but has no enabled provider")
	}
	secret, decryptErr := protector.Unprotect(ProtectedCredential{Ciphertext: provider.EncryptedClientSecret, Nonce: provider.ClientSecretNonce, KeyID: provider.ClientSecretKeyID}, providerCredentialAAD(provider.ProviderKey))
	if decryptErr != nil {
		return nil, nil, fmt.Errorf("decrypt database OIDC provider credential: %w", decryptErr)
	}
	effective := *cfg
	effective.OIDCEnabled = true
	if cfg.PublicURL == "" {
		return nil, nil, fmt.Errorf("AUTH_PUBLIC_URL is required when database OIDC configuration is active")
	}
	allowHTTP := allowLocalOIDC(cfg.PublicURL)
	issuerURL, validationErr := oidchelper.ValidateIssuerURL(provider.IssuerURL, allowHTTP)
	if validationErr != nil {
		return nil, nil, validationErr
	}
	effective.Providers = map[string]*oidchelper.ProviderConfig{provider.ProviderKey: {
		Name: provider.ProviderKey, IssuerURL: issuerURL.String(), ClientID: provider.ClientID,
		ClientSecret: string(secret), RedirectURL: cfg.PublicURL + publicOIDCCallbackPath, DisplayName: provider.DisplayName,
		Scopes:     strings.FieldsFunc(provider.Scopes, func(r rune) bool { return r == ',' || r == ' ' }),
		HTTPClient: oidchelper.NewRestrictedHTTPClient(allowHTTP),
	}}
	return &effective, protector, nil
}

func allowLocalOIDC(publicURL string) bool {
	return strings.HasPrefix(publicURL, "http://localhost:") || strings.HasPrefix(publicURL, "http://127.0.0.1:")
}

func loadCredentialProtector(basicRes context.BasicRes) (CredentialProtector, error) {
	config := basicRes.GetConfigReader()
	primaryKey, err := decodeCredentialKey(config.GetString(oidcCredentialKeyConfig))
	if err != nil {
		return nil, err
	}
	previousKey, err := decodeCredentialKey(config.GetString(oidcCredentialPreviousKeyConfig))
	if err != nil {
		return nil, err
	}
	return newAESGCMKeyring(strings.TrimSpace(config.GetString(oidcCredentialKeyIDConfig)), primaryKey,
		strings.TrimSpace(config.GetString(oidcCredentialPreviousKeyIDConfig)), previousKey)
}

func decodeCredentialKey(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("OIDC credential key must be base64 encoded")
	}
	return key, nil
}

func providerCredentialAAD(providerKey string) []byte {
	return []byte(fmt.Sprintf("auth_oidc_providers:%s:client_secret", providerKey))
}
