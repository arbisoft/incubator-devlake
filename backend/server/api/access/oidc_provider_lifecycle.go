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
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

func (s *Service) ActivateOIDCProvider(ctx context.Context, actor string) (*OIDCProviderResponse, errors.Error) {
	s.oidcLifecycleMu.Lock()
	defer s.oidcLifecycleMu.Unlock()

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

func (s *Service) DisableOIDCProvider(ctx context.Context, actor string) (*OIDCProviderResponse, errors.Error) {
	s.oidcLifecycleMu.Lock()
	defer s.oidcLifecycleMu.Unlock()

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
	s.oidcLifecycleMu.Lock()
	defer s.oidcLifecycleMu.Unlock()

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
	s.oidcLifecycleMu.Lock()
	defer s.oidcLifecycleMu.Unlock()

	provider, configuration, err := s.currentOIDCCandidate()
	if err != nil {
		return nil, err
	}
	if configuration.ActivatedAt != nil {
		return nil, errors.BadInput.New("the active OIDC provider cannot be retired", errors.WithData(ErrCodeProviderBlocked))
	}
	return s.setOIDCProviderRetired(actor, provider, configuration)
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
