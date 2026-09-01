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
	"context"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

const (
	auditProviderCreated                   = "provider.created"
	auditProviderUpdated                   = "provider.updated"
	auditProviderActivated                 = "provider.database_activated"
	auditProviderEnabled                   = "provider.enabled"
	auditProviderDisabled                  = "provider.disabled"
	auditProviderRetired                   = "provider.retired"
	auditProviderGrafanaSyncSucceeded      = "provider.grafana_sync_succeeded"
	auditProviderGrafanaSyncFailed         = "provider.grafana_sync_failed"
	auditProviderGrafanaCompensationFailed = "provider.grafana_sync_compensation_failed"
)

func (s *Service) GetOIDCProvider() (*OIDCProviderResponse, errors.Error) {
	configuration := &OIDCProviderConfiguration{}
	if err := s.db.First(configuration, dal.Where("id = ?", OIDCProviderSourceKey)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return &OIDCProviderResponse{GrafanaSyncStatus: OIDCProviderStatusPending}, nil
		}
		return nil, errors.Default.Wrap(err, "error reading OIDC provider configuration")
	}
	if configuration.CandidateProviderID != 0 {
		candidate := &OIDCProviderCandidate{}
		if err := s.db.First(candidate, dal.Where("id = ? AND promoted_at IS NULL", configuration.CandidateProviderID)); err != nil {
			return nil, errors.Default.Wrap(err, "error reading OIDC provider candidate")
		}
		return oidcProviderResponse(oidcProviderFromCandidate(candidate), configuration), nil
	}
	provider := &OIDCProvider{}
	if err := s.db.First(provider, dal.Where("retired_at IS NULL")); err != nil {
		if s.db.IsErrorNotFound(err) {
			return &OIDCProviderResponse{
				DatabaseSourceActive:  configuration.ActivatedAt != nil,
				GrafanaSyncStatus:     configuration.GrafanaSyncStatus,
				GrafanaSyncedRevision: configuration.GrafanaSyncedRevision,
				ProviderRevision:      configuration.ProviderRevision,
			}, nil
		}
		return nil, errors.Default.Wrap(err, "error reading OIDC provider")
	}
	return oidcProviderResponse(provider, configuration), nil
}

func (s *Service) ValidateOIDCProvider(ctx context.Context, input OIDCProviderInput) errors.Error {
	if _, _, err := s.oidcProviderCallbacks(); err != nil {
		return err
	}
	provider, secret, err := normalizeOIDCProviderInput(input)
	if err != nil {
		return err
	}
	if s.oidcRuntime == nil {
		return errors.Unavailable.New("OIDC provider administration is not configured", errors.WithData(ErrCodeProviderBlocked))
	}
	if _, _, err := s.resolveOIDCProviderInput(provider, secret); err != nil {
		return err
	}
	_, runtimeErr := s.oidcRuntime.PrepareOIDCProvider(ctx, provider, secret)
	return runtimeErr
}

func (s *Service) SaveOIDCProvider(ctx context.Context, actor string, input OIDCProviderInput) (*OIDCProviderResponse, errors.Error) {
	s.oidcLifecycleMu.Lock()
	defer s.oidcLifecycleMu.Unlock()

	if _, _, err := s.oidcProviderCallbacks(); err != nil {
		return nil, err
	}
	provider, secret, err := normalizeOIDCProviderInput(input)
	if err != nil {
		return nil, err
	}
	if s.oidcRuntime == nil {
		return nil, errors.Unavailable.New("OIDC provider administration is not configured", errors.WithData(ErrCodeProviderBlocked))
	}
	if s.grafanaSSO == nil {
		s.logger.Warn(errors.Default.New("Grafana SSO client is unavailable"), "access: OIDC provider save blocked")
		return nil, errors.Unavailable.New("OIDC provider administration is not configured", errors.WithData(ErrCodeProviderBlocked))
	}

	configuration, current, resolveErr := s.resolveOIDCProviderInput(provider, secret)
	if resolveErr != nil {
		return nil, resolveErr
	}
	if current != nil {
		provider.ID = current.ID
		provider.CreatedAt = current.CreatedAt
	}

	prepared, prepareErr := s.oidcRuntime.PrepareOIDCProvider(ctx, provider, secret)
	if prepareErr != nil {
		return nil, prepareErr
	}

	configuration, saveErr := s.persistOIDCCandidate(provider, prepared, current != nil && configuration.ActivatedAt != nil)
	if saveErr != nil {
		return nil, saveErr
	}
	provider.Enabled = false
	provider.EncryptedClientSecret = prepared.EncryptedClientSecret
	provider.ClientSecretNonce = prepared.ClientSecretNonce
	provider.ClientSecretKeyID = prepared.ClientSecretKeyID

	if configuration.ActivatedAt != nil {
		s.audit(actor, auditProviderUpdated, nil, providerAuditDetail(provider.ProviderKey))
		return oidcProviderResponse(provider, configuration), nil
	}
	if syncErr := s.syncGrafana(ctx, provider, prepared.GrafanaSettings, false, configuration); syncErr != nil {
		s.audit(actor, auditProviderGrafanaSyncFailed, nil, providerAuditDetail(provider.ProviderKey))
		return oidcProviderResponse(provider, configuration), syncErr
	}
	action := auditProviderCreated
	if current != nil {
		action = auditProviderUpdated
	}
	s.audit(actor, action, nil, providerAuditDetail(provider.ProviderKey))
	s.audit(actor, auditProviderGrafanaSyncSucceeded, nil, providerAuditDetail(provider.ProviderKey))
	return oidcProviderResponse(provider, configuration), nil
}

// resolveOIDCProviderInput enforces the update contract without exposing a stored
// credential. A configured credential can be reused only for the same OAuth client.
func (s *Service) resolveOIDCProviderInput(provider *OIDCProvider, clientSecret string) (*OIDCProviderConfiguration, *OIDCProvider, errors.Error) {
	configuration := &OIDCProviderConfiguration{}
	configurationErr := s.db.First(configuration, dal.Where("id = ?", OIDCProviderSourceKey))
	if configurationErr != nil {
		if !s.db.IsErrorNotFound(configurationErr) {
			return nil, nil, errors.Default.Wrap(configurationErr, "error reading OIDC provider configuration")
		}
		configuration = &OIDCProviderConfiguration{}
	}

	current := &OIDCProvider{}
	currentErr := s.db.First(current, dal.Where("retired_at IS NULL"))
	if currentErr != nil {
		if !s.db.IsErrorNotFound(currentErr) {
			return nil, nil, errors.Default.Wrap(currentErr, "error reading OIDC provider")
		}
		current = nil
	}
	if err := validateOIDCProviderIdentity(provider, current); err != nil {
		return nil, nil, err
	}

	credentialSource := current
	if configuration.CandidateProviderID != 0 {
		candidate := &OIDCProviderCandidate{}
		if err := s.db.First(candidate, dal.Where("id = ? AND promoted_at IS NULL", configuration.CandidateProviderID)); err != nil {
			return nil, nil, errors.Default.Wrap(err, "error reading OIDC provider candidate")
		}
		credentialSource = oidcProviderFromCandidate(candidate)
	}
	if err := reuseOIDCProviderCredential(provider, credentialSource, clientSecret); err != nil {
		return nil, nil, err
	}
	return configuration, current, nil
}

func validateOIDCProviderIdentity(provider, current *OIDCProvider) errors.Error {
	if current == nil || (current.ProviderKey == provider.ProviderKey && current.IssuerURL == provider.IssuerURL) {
		return nil
	}
	return errors.BadInput.New("the current release requires the active OIDC provider key and issuer to remain unchanged", errors.WithData(ErrCodeProviderBlocked))
}

func reuseOIDCProviderCredential(provider, stored *OIDCProvider, clientSecret string) errors.Error {
	if clientSecret != "" {
		return nil
	}
	if stored == nil {
		return errors.BadInput.New("client secret is required", errors.WithData(ErrCodeInvalidProvider))
	}
	if provider.ClientID != stored.ClientID {
		return errors.BadInput.New("a replacement client secret is required when changing the client ID", errors.WithData(ErrCodeInvalidProvider))
	}
	if !hasOIDCProviderSecret(stored) {
		return errors.Default.New("stored OIDC provider credential is unavailable")
	}
	provider.EncryptedClientSecret = stored.EncryptedClientSecret
	provider.ClientSecretNonce = stored.ClientSecretNonce
	provider.ClientSecretKeyID = stored.ClientSecretKeyID
	return nil
}
