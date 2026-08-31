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
	"fmt"
	"strings"
	"time"

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
	_, runtimeErr := s.oidcRuntime.PrepareOIDCProvider(ctx, provider, secret)
	return runtimeErr
}

func (s *Service) SaveOIDCProvider(ctx context.Context, actor string, input OIDCProviderInput) (*OIDCProviderResponse, errors.Error) {
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

	configuration := &OIDCProviderConfiguration{}
	configurationErr := s.db.First(configuration, dal.Where("id = ?", OIDCProviderSourceKey))
	if configurationErr != nil && !s.db.IsErrorNotFound(configurationErr) {
		return nil, errors.Default.Wrap(configurationErr, "error reading OIDC provider configuration")
	}

	current := &OIDCProvider{}
	lookupErr := s.db.First(current, dal.Where("retired_at IS NULL"))
	if lookupErr != nil && !s.db.IsErrorNotFound(lookupErr) {
		return nil, errors.Default.Wrap(lookupErr, "error reading OIDC provider")
	}
	if lookupErr == nil {
		if current.ProviderKey != provider.ProviderKey || current.IssuerURL != provider.IssuerURL {
			return nil, errors.BadInput.New("the current release requires the active OIDC provider key and issuer to remain unchanged", errors.WithData(ErrCodeProviderBlocked))
		}
		if secret == "" {
			return nil, errors.BadInput.New("a replacement client secret is required when updating OIDC provider settings", errors.WithData(ErrCodeInvalidProvider))
		}
		provider.ID = current.ID
	}
	if secret == "" {
		return nil, errors.BadInput.New("client secret is required", errors.WithData(ErrCodeInvalidProvider))
	}

	prepared, prepareErr := s.oidcRuntime.PrepareOIDCProvider(ctx, provider, secret)
	if prepareErr != nil {
		return nil, prepareErr
	}

	configuration, saveErr := s.persistOIDCCandidate(provider, prepared, lookupErr == nil && configuration.ActivatedAt != nil)
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
	if lookupErr == nil {
		action = auditProviderUpdated
	}
	s.audit(actor, action, nil, providerAuditDetail(provider.ProviderKey))
	s.audit(actor, auditProviderGrafanaSyncSucceeded, nil, providerAuditDetail(provider.ProviderKey))
	return oidcProviderResponse(provider, configuration), nil
}

func (s *Service) ActivateOIDCProvider(ctx context.Context, actor string) (*OIDCProviderResponse, errors.Error) {
	provider, configuration, err := s.currentOIDCCandidate()
	if err != nil {
		return nil, err
	}
	if configuration.GrafanaSyncStatus == OIDCProviderStatusCompensationFailed {
		return nil, errors.Unavailable.New("OIDC provider requires operator recovery before it can be activated", errors.WithData(ErrCodeProviderBlocked))
	}
	if s.oidcRuntime == nil || s.grafanaSSO == nil {
		return nil, errors.Unavailable.New("OIDC provider administration is not configured", errors.WithData(ErrCodeProviderBlocked))
	}
	prepared, prepareErr := s.oidcRuntime.PrepareOIDCProvider(ctx, provider, "")
	if prepareErr != nil {
		return nil, prepareErr
	}
	if syncErr := s.syncGrafana(ctx, provider, prepared.GrafanaSettings, true, configuration); syncErr != nil {
		s.audit(actor, auditProviderGrafanaSyncFailed, nil, providerAuditDetail(provider.ProviderKey))
		return nil, syncErr
	}

	if activateErr := s.activateOIDCProvider(provider, configuration); activateErr != nil {
		if compensationErr := s.compensateGrafanaActivation(ctx, provider, prepared.GrafanaSettings, configuration); compensationErr != nil {
			s.recordGrafanaCompensationFailure(configuration, provider.ProviderKey, compensationErr)
			return nil, errors.Unavailable.New("OIDC provider activation requires operator recovery", errors.WithData(ErrCodeProviderBlocked))
		}
		return nil, activateErr
	}
	if refreshErr := s.oidcRuntime.RefreshOIDCProvider(ctx); refreshErr != nil {
		return nil, errors.Unavailable.New("OIDC provider was activated but is not ready; retry after provider discovery recovers", errors.WithData(ErrCodeProviderBlocked))
	}
	s.audit(actor, auditProviderActivated, nil, providerAuditDetail(provider.ProviderKey))
	return oidcProviderResponse(provider, configuration), nil
}

func (s *Service) compensateGrafanaActivation(ctx context.Context, candidate *OIDCProvider, candidateSettings GrafanaSSOSettings, configuration *OIDCProviderConfiguration) errors.Error {
	if configuration.ActivatedAt == nil || configuration.CandidateProviderID == 0 {
		return s.syncGrafana(ctx, candidate, candidateSettings, false, configuration)
	}
	active := &OIDCProvider{}
	if err := s.db.First(active, dal.Where("enabled = ? AND retired_at IS NULL", true)); err != nil {
		return errors.Default.Wrap(err, "error reading active OIDC provider for Grafana compensation")
	}
	prepared, prepareErr := s.oidcRuntime.PrepareOIDCProvider(ctx, active, "")
	if prepareErr != nil {
		return prepareErr
	}
	prepared.GrafanaSettings.Enabled = true
	if err := s.grafanaSSO.PutGenericOAuth(ctx, prepared.GrafanaSettings); err != nil {
		return errors.Unavailable.New("Grafana OAuth configuration could not be restored", errors.WithData(ErrCodeProviderBlocked))
	}
	configuration.GrafanaSyncStatus = OIDCProviderStatusFailed
	configuration.GrafanaLastErrorCode = ErrCodeProviderBlocked
	if err := s.db.Update(configuration); err != nil {
		return errors.Default.Wrap(err, "error recording restored Grafana OIDC configuration")
	}
	return nil
}

func (s *Service) DisableOIDCProvider(ctx context.Context, actor string) (*OIDCProviderResponse, errors.Error) {
	provider, configuration, err := s.currentOIDCCandidate()
	if err != nil {
		return nil, err
	}
	if configuration.ActivatedAt != nil {
		return nil, errors.BadInput.New("the only active OIDC provider cannot be disabled", errors.WithData(ErrCodeProviderBlocked))
	}
	if provider.Enabled {
		return s.setOIDCProviderEnabled(ctx, actor, provider, configuration, false)
	}
	return oidcProviderResponse(provider, configuration), nil
}

func (s *Service) EnableOIDCProvider(ctx context.Context, actor string) (*OIDCProviderResponse, errors.Error) {
	provider, configuration, err := s.currentOIDCCandidate()
	if err != nil {
		return nil, err
	}
	if configuration.ActivatedAt == nil {
		return nil, errors.BadInput.New("activate database OIDC configuration before enabling the provider", errors.WithData(ErrCodeProviderBlocked))
	}
	if provider.Enabled {
		return oidcProviderResponse(provider, configuration), nil
	}
	return s.setOIDCProviderEnabled(ctx, actor, provider, configuration, true)
}

func (s *Service) RetireOIDCProvider(actor string) (*OIDCProviderResponse, errors.Error) {
	provider, configuration, err := s.currentOIDCCandidate()
	if err != nil {
		return nil, err
	}
	if configuration.ActivatedAt != nil {
		return nil, errors.BadInput.New("the active OIDC provider cannot be retired", errors.WithData(ErrCodeProviderBlocked))
	}
	return s.setOIDCProviderRetired(actor, provider, configuration)
}

func (s *Service) RetryGrafanaOIDCProviderSync(ctx context.Context, actor string) (*OIDCProviderResponse, errors.Error) {
	provider, configuration, err := s.currentOIDCCandidate()
	if err != nil {
		return nil, err
	}
	if s.oidcRuntime == nil || s.grafanaSSO == nil {
		return nil, errors.Unavailable.New("OIDC provider administration is not configured", errors.WithData(ErrCodeProviderBlocked))
	}
	if configuration.ActivatedAt != nil && configuration.CandidateProviderID != 0 {
		return nil, errors.BadInput.New("activate the staged OIDC provider revision to synchronize it", errors.WithData(ErrCodeProviderBlocked))
	}
	prepared, prepareErr := s.oidcRuntime.PrepareOIDCProvider(ctx, provider, "")
	if prepareErr != nil {
		return nil, prepareErr
	}
	if syncErr := s.syncGrafana(ctx, provider, prepared.GrafanaSettings, configuration.ActivatedAt != nil, configuration); syncErr != nil {
		s.audit(actor, auditProviderGrafanaSyncFailed, nil, providerAuditDetail(provider.ProviderKey))
		return nil, syncErr
	}
	s.audit(actor, auditProviderGrafanaSyncSucceeded, nil, providerAuditDetail(provider.ProviderKey))
	return oidcProviderResponse(provider, configuration), nil
}

func (s *Service) persistOIDCCandidate(provider *OIDCProvider, prepared *PreparedOIDCProvider, update bool) (*OIDCProviderConfiguration, errors.Error) {
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback OIDC provider candidate")
			}
		}
	}()
	configuration := &OIDCProviderConfiguration{}
	if err := tx.First(configuration, dal.Where("id = ?", OIDCProviderSourceKey)); err != nil {
		if !tx.IsErrorNotFound(err) {
			return nil, errors.Default.Wrap(err, "error reading OIDC provider configuration")
		}
		configuration.ID = OIDCProviderSourceKey
	}
	configuration.ProviderRevision++
	configuration.GrafanaSyncStatus = OIDCProviderStatusPending
	configuration.GrafanaLastErrorCode = ""
	configuration.GrafanaLastSyncedAt = nil
	if configuration.CreatedAt.IsZero() {
		if err := tx.Create(configuration); err != nil {
			return nil, errors.Default.Wrap(err, "error creating OIDC provider configuration")
		}
	} else if err := tx.Update(configuration); err != nil {
		return nil, errors.Default.Wrap(err, "error updating OIDC provider configuration")
	}

	provider.EncryptedClientSecret = prepared.EncryptedClientSecret
	provider.ClientSecretNonce = prepared.ClientSecretNonce
	provider.ClientSecretKeyID = prepared.ClientSecretKeyID
	if update {
		candidate := &OIDCProviderCandidate{
			ProviderKey: provider.ProviderKey, DisplayName: provider.DisplayName, IssuerURL: provider.IssuerURL,
			ClientID: provider.ClientID, EncryptedClientSecret: provider.EncryptedClientSecret,
			ClientSecretNonce: provider.ClientSecretNonce, ClientSecretKeyID: provider.ClientSecretKeyID,
			Scopes: provider.Scopes, Revision: configuration.ProviderRevision,
		}
		if err := tx.Create(candidate); err != nil {
			return nil, errors.Default.Wrap(err, "error creating OIDC provider candidate")
		}
		configuration.CandidateProviderID = candidate.ID
		if err := tx.Update(configuration); err != nil {
			return nil, errors.Default.Wrap(err, "error recording OIDC provider candidate")
		}
		provider.ID = candidate.ID
		provider.Enabled = true
	} else if provider.ID != 0 {
		if err := tx.Update(provider); err != nil {
			return nil, errors.Default.Wrap(err, "error updating OIDC provider")
		}
	} else if err := tx.Create(provider); err != nil {
		return nil, errors.Default.Wrap(err, "error creating OIDC provider")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing OIDC provider candidate")
	}
	committed = true
	return configuration, nil
}

func (s *Service) syncGrafana(ctx context.Context, provider *OIDCProvider, settings GrafanaSSOSettings, enabled bool, configuration *OIDCProviderConfiguration) errors.Error {
	settings.Enabled = enabled
	if err := s.grafanaSSO.PutGenericOAuth(ctx, settings); err != nil {
		s.recordGrafanaSyncFailure(configuration, provider.ProviderKey)
		return errors.Unavailable.New("Grafana OAuth configuration could not be synchronized", errors.WithData(ErrCodeProviderBlocked))
	}
	now := time.Now()
	configuration.GrafanaSyncStatus = OIDCProviderStatusSynchronized
	configuration.GrafanaSyncedRevision = configuration.ProviderRevision
	configuration.GrafanaLastSyncedAt = &now
	configuration.GrafanaLastErrorCode = ""
	if err := s.db.Update(configuration); err != nil {
		return errors.Default.Wrap(err, "error recording Grafana OIDC synchronization")
	}
	return nil
}

func (s *Service) recordGrafanaSyncFailure(configuration *OIDCProviderConfiguration, providerKey string) {
	configuration.GrafanaSyncStatus = OIDCProviderStatusFailed
	configuration.GrafanaLastErrorCode = ErrCodeProviderBlocked
	if err := s.db.Update(configuration); err != nil {
		s.logger.Error(err, "access: record Grafana OIDC sync failure provider=%s", providerKey)
	}
}

func (s *Service) recordGrafanaCompensationFailure(configuration *OIDCProviderConfiguration, providerKey string, cause errors.Error) {
	configuration.GrafanaSyncStatus = OIDCProviderStatusCompensationFailed
	configuration.GrafanaLastErrorCode = ErrCodeProviderBlocked
	if err := s.db.Update(configuration); err != nil {
		s.logger.Error(err, "access: record Grafana OIDC compensation failure provider=%s", providerKey)
	}
	s.logger.Error(cause, "access: Grafana OIDC compensation failed provider=%s", providerKey)
}

func (s *Service) activateOIDCProvider(provider *OIDCProvider, configuration *OIDCProviderConfiguration) errors.Error {
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback OIDC provider activation provider=%s", provider.ProviderKey)
			}
		}
	}()
	now := time.Now()
	if configuration.CandidateProviderID != 0 {
		candidate := &OIDCProviderCandidate{}
		if err := tx.First(candidate, dal.Where("id = ? AND promoted_at IS NULL", configuration.CandidateProviderID)); err != nil {
			return errors.Default.Wrap(err, "error reading OIDC provider candidate for activation")
		}
		active := &OIDCProvider{}
		if err := tx.First(active, dal.Where("enabled = ? AND retired_at IS NULL", true)); err != nil {
			return errors.Default.Wrap(err, "error reading active OIDC provider for activation")
		}
		if err := tx.UpdateColumns(&OIDCProvider{}, []dal.DalSet{
			{ColumnName: "display_name", Value: candidate.DisplayName},
			{ColumnName: "client_id", Value: candidate.ClientID},
			{ColumnName: "encrypted_client_secret", Value: candidate.EncryptedClientSecret},
			{ColumnName: "client_secret_nonce", Value: candidate.ClientSecretNonce},
			{ColumnName: "client_secret_key_id", Value: candidate.ClientSecretKeyID},
			{ColumnName: "scopes", Value: candidate.Scopes},
		}, dal.Where("id = ?", active.ID)); err != nil {
			return errors.Default.Wrap(err, "error promoting OIDC provider candidate")
		}
		if err := tx.UpdateColumns(&OIDCProviderCandidate{}, []dal.DalSet{{ColumnName: "promoted_at", Value: now}}, dal.Where("id = ?", candidate.ID)); err != nil {
			return errors.Default.Wrap(err, "error recording OIDC provider candidate promotion")
		}
		if err := tx.UpdateColumns(&OIDCProviderConfiguration{}, []dal.DalSet{{ColumnName: "candidate_provider_id", Value: uint64(0)}}, dal.Where("id = ?", OIDCProviderSourceKey)); err != nil {
			return errors.Default.Wrap(err, "error clearing promoted OIDC provider candidate")
		}
		provider.ID = active.ID
		configuration.CandidateProviderID = 0
	} else if err := tx.UpdateColumns(&OIDCProvider{}, []dal.DalSet{{ColumnName: "enabled", Value: true}}, dal.Where("id = ? AND retired_at IS NULL", provider.ID)); err != nil {
		return errors.Default.Wrap(err, "error enabling OIDC provider")
	}
	if err := tx.UpdateColumns(&OIDCProviderConfiguration{}, []dal.DalSet{{ColumnName: "activated_at", Value: now}}, dal.Where("id = ? AND activated_at IS NULL", OIDCProviderSourceKey)); err != nil {
		return errors.Default.Wrap(err, "error activating database OIDC source")
	}
	if err := tx.Commit(); err != nil {
		return errors.Default.Wrap(err, "error committing OIDC provider activation")
	}
	committed = true
	provider.Enabled = true
	configuration.ActivatedAt = &now
	return nil
}

func (s *Service) setOIDCProviderEnabled(ctx context.Context, actor string, provider *OIDCProvider, configuration *OIDCProviderConfiguration, enabled bool) (*OIDCProviderResponse, errors.Error) {
	if s.oidcRuntime == nil {
		return nil, errors.Unavailable.New("OIDC provider administration is not configured", errors.WithData(ErrCodeProviderBlocked))
	}
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback OIDC provider enabled state provider=%s", provider.ProviderKey)
			}
		}
	}()
	if err := tx.UpdateColumns(&OIDCProvider{}, []dal.DalSet{{ColumnName: "enabled", Value: enabled}}, dal.Where("id = ? AND retired_at IS NULL", provider.ID)); err != nil {
		return nil, errors.Default.Wrap(err, "error updating OIDC provider enabled state")
	}
	revokedIDs, revokeErr := s.oidcRuntime.RevokeProviderSessions(tx, provider.ProviderKey)
	if revokeErr != nil {
		return nil, errors.Default.Wrap(revokeErr, "error revoking OIDC provider sessions")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing OIDC provider enabled state")
	}
	committed = true
	provider.Enabled = enabled
	s.oidcRuntime.CacheRevokedSessions(revokedIDs)
	if refreshErr := s.oidcRuntime.RefreshOIDCProvider(ctx); refreshErr != nil && enabled {
		return nil, errors.Unavailable.New("OIDC provider was enabled but is not ready", errors.WithData(ErrCodeProviderBlocked))
	}
	action := auditProviderDisabled
	if enabled {
		action = auditProviderEnabled
	}
	s.audit(actor, action, nil, providerAuditDetail(provider.ProviderKey))
	return oidcProviderResponse(provider, configuration), nil
}

func (s *Service) setOIDCProviderRetired(actor string, provider *OIDCProvider, configuration *OIDCProviderConfiguration) (*OIDCProviderResponse, errors.Error) {
	if s.oidcRuntime == nil {
		return nil, errors.Unavailable.New("OIDC provider administration is not configured", errors.WithData(ErrCodeProviderBlocked))
	}
	tx := s.db.Begin()
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.logger.Error(rollbackErr, "access: rollback OIDC provider retirement provider=%s", provider.ProviderKey)
			}
		}
	}()
	now := time.Now()
	if err := tx.UpdateColumns(&OIDCProvider{}, []dal.DalSet{{ColumnName: "enabled", Value: false}, {ColumnName: "retired_at", Value: now}}, dal.Where("id = ? AND retired_at IS NULL", provider.ID)); err != nil {
		return nil, errors.Default.Wrap(err, "error retiring OIDC provider")
	}
	revokedIDs, revokeErr := s.oidcRuntime.RevokeProviderSessions(tx, provider.ProviderKey)
	if revokeErr != nil {
		return nil, errors.Default.Wrap(revokeErr, "error revoking OIDC provider sessions")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing OIDC provider retirement")
	}
	committed = true
	provider.Enabled = false
	provider.RetiredAt = &now
	s.oidcRuntime.CacheRevokedSessions(revokedIDs)
	s.audit(actor, auditProviderRetired, nil, providerAuditDetail(provider.ProviderKey))
	return oidcProviderResponse(provider, configuration), nil
}

func (s *Service) currentOIDCCandidate() (*OIDCProvider, *OIDCProviderConfiguration, errors.Error) {
	configuration := &OIDCProviderConfiguration{}
	if err := s.db.First(configuration, dal.Where("id = ?", OIDCProviderSourceKey)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, nil, errors.NotFound.New("OIDC provider is not configured", errors.WithData(ErrCodeProviderMissing))
		}
		return nil, nil, errors.Default.Wrap(err, "error reading OIDC provider configuration")
	}
	if configuration.CandidateProviderID != 0 {
		candidate := &OIDCProviderCandidate{}
		if err := s.db.First(candidate, dal.Where("id = ? AND promoted_at IS NULL", configuration.CandidateProviderID)); err != nil {
			if s.db.IsErrorNotFound(err) {
				return nil, nil, errors.Default.New("OIDC provider candidate is unavailable")
			}
			return nil, nil, errors.Default.Wrap(err, "error reading OIDC provider candidate")
		}
		return oidcProviderFromCandidate(candidate), configuration, nil
	}
	provider := &OIDCProvider{}
	if err := s.db.First(provider, dal.Where("retired_at IS NULL")); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, nil, errors.NotFound.New("OIDC provider is not configured", errors.WithData(ErrCodeProviderMissing))
		}
		return nil, nil, errors.Default.Wrap(err, "error reading OIDC provider")
	}
	return provider, configuration, nil
}

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
		SecretConfigured:     len(provider.EncryptedClientSecret) > 0 && len(provider.ClientSecretNonce) > 0 && provider.ClientSecretKeyID != "",
		DatabaseSourceActive: configuration.ActivatedAt != nil, GrafanaSyncStatus: configuration.GrafanaSyncStatus,
		GrafanaSyncedRevision: configuration.GrafanaSyncedRevision, ProviderRevision: configuration.ProviderRevision,
	}
}

func providerAuditDetail(providerKey string) string { return fmt.Sprintf("provider=%s", providerKey) }

func oidcProviderFromCandidate(candidate *OIDCProviderCandidate) *OIDCProvider {
	return &OIDCProvider{
		ProviderKey: candidate.ProviderKey, DisplayName: candidate.DisplayName, IssuerURL: candidate.IssuerURL,
		ClientID: candidate.ClientID, EncryptedClientSecret: candidate.EncryptedClientSecret,
		ClientSecretNonce: candidate.ClientSecretNonce, ClientSecretKeyID: candidate.ClientSecretKeyID,
		Scopes: candidate.Scopes,
	}
}
