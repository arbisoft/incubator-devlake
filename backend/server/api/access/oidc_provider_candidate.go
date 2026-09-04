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
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

func (s *Service) persistOIDCCandidate(provider *OIDCProvider, prepared *PreparedOIDCProvider, update bool) (*OIDCProviderConfiguration, errors.Error) {
	tx := s.db.Begin()
	committed := false
	now := time.Now()
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
	configuration.UpdatedAt = now
	if configuration.CreatedAt.IsZero() {
		configuration.CreatedAt = now
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
		candidate.CreatedAt = now
		candidate.UpdatedAt = now
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
		provider.UpdatedAt = now
		if err := tx.Update(provider); err != nil {
			return nil, errors.Default.Wrap(err, "error updating OIDC provider")
		}
	} else {
		provider.CreatedAt = now
		provider.UpdatedAt = now
		if err := tx.Create(provider); err != nil {
			return nil, errors.Default.Wrap(err, "error creating OIDC provider")
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing OIDC provider candidate")
	}
	committed = true
	return configuration, nil
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

func oidcProviderFromCandidate(candidate *OIDCProviderCandidate) *OIDCProvider {
	return &OIDCProvider{
		ProviderKey: candidate.ProviderKey, DisplayName: candidate.DisplayName, IssuerURL: candidate.IssuerURL,
		ClientID: candidate.ClientID, EncryptedClientSecret: candidate.EncryptedClientSecret,
		ClientSecretNonce: candidate.ClientSecretNonce, ClientSecretKeyID: candidate.ClientSecretKeyID,
		Scopes: candidate.Scopes,
	}
}
