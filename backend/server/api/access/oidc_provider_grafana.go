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

func (s *Service) RetryGrafanaOIDCProviderSync(ctx context.Context, actor string) (*OIDCProviderResponse, errors.Error) {
	s.oidcLifecycleMu.Lock()
	defer s.oidcLifecycleMu.Unlock()

	provider, configuration, err := s.currentOIDCCandidate()
	if err != nil {
		return nil, err
	}
	if s.oidcRuntime == nil {
		return nil, errors.Unavailable.New("OIDC provider administration is not configured", errors.WithData(ErrCodeProviderBlocked))
	}
	if s.grafanaSSO == nil {
		return nil, grafanaSynchronizationUnavailableError()
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

func grafanaSynchronizationUnavailableError() errors.Error {
	return errors.Unavailable.New("Grafana synchronization is unavailable; configure the Grafana management connection", errors.WithData(ErrCodeProviderBlocked))
}

func (s *Service) compensateGrafanaActivation(ctx context.Context, candidate *OIDCProvider, candidateSettings GrafanaSSOSettings, configuration *OIDCProviderConfiguration) errors.Error {
	if configuration.ActivatedAt == nil || configuration.CandidateProviderID == 0 {
		candidateSettings.Enabled = false
		if err := s.grafanaSSO.PutGenericOAuth(ctx, candidateSettings); err != nil {
			return errors.Unavailable.New("Grafana OAuth configuration could not be restored", errors.WithData(ErrCodeProviderBlocked))
		}
		return s.recordGrafanaCompensated(configuration, configuration.ProviderRevision)
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
	return s.recordGrafanaCompensated(configuration, configuration.GrafanaSyncedRevision)
}

func (s *Service) syncGrafana(ctx context.Context, provider *OIDCProvider, settings GrafanaSSOSettings, enabled bool, configuration *OIDCProviderConfiguration) errors.Error {
	settings.Enabled = enabled
	if err := s.grafanaSSO.PutGenericOAuth(ctx, settings); err != nil {
		s.logger.Error(err, "access: Grafana OAuth synchronization failed provider=%s", provider.ProviderKey)
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

// recordGrafanaCompensated records that Grafana was restored after DevLake's
// activation transaction failed. It is distinct from a normal synchronization
// failure: retrying the explicit activation is safe because Grafana is known to
// be back at the recorded revision.
func (s *Service) recordGrafanaCompensated(configuration *OIDCProviderConfiguration, restoredRevision uint64) errors.Error {
	now := time.Now()
	configuration.GrafanaSyncStatus = OIDCProviderStatusCompensated
	configuration.GrafanaSyncedRevision = restoredRevision
	configuration.GrafanaLastSyncedAt = &now
	configuration.GrafanaLastErrorCode = ErrCodeProviderBlocked
	if err := s.db.Update(configuration); err != nil {
		return errors.Default.Wrap(err, "error recording restored Grafana OIDC configuration")
	}
	return nil
}

func (s *Service) recordGrafanaCompensationFailure(configuration *OIDCProviderConfiguration, providerKey string, cause errors.Error) {
	configuration.GrafanaSyncStatus = OIDCProviderStatusCompensationFailed
	configuration.GrafanaLastErrorCode = ErrCodeProviderBlocked
	if err := s.db.Update(configuration); err != nil {
		s.logger.Error(err, "access: record Grafana OIDC compensation failure provider=%s", providerKey)
	}
	s.logger.Error(cause, "access: Grafana OIDC compensation failed provider=%s", providerKey)
}
