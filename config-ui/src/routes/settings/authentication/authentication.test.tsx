/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { GRAFANA_PROVIDER_KIND, OIDC_PROVIDER_SYNC_STATUS, type OIDCCallbacks, type OIDCProvider } from '@/api/access';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY } from '@/ui/constants';

import { SettingsAuthentication } from './authentication';
import { AUTHENTICATION_STATE, COPY } from './constants';

vi.mock('@/api', () => ({
  default: {
    access: {
      listOIDCProviders: vi.fn(),
      getOIDCCallbacks: vi.fn(),
    },
  },
}));

const access = vi.mocked(API.access);

const callbacks: OIDCCallbacks = {
  devlakeCallbackUrl: 'https://devlake.example.com/api/auth/callback',
  grafanaCallbackUrls: {
    [GRAFANA_PROVIDER_KIND.NONE]: 'https://grafana.example.com/login',
    [GRAFANA_PROVIDER_KIND.GOOGLE]: 'https://grafana.example.com/login/google',
    [GRAFANA_PROVIDER_KIND.AZURE_AD]: 'https://grafana.example.com/login/azuread',
    [GRAFANA_PROVIDER_KIND.OKTA]: 'https://grafana.example.com/login/okta',
    [GRAFANA_PROVIDER_KIND.GITLAB]: 'https://grafana.example.com/login/gitlab',
    [GRAFANA_PROVIDER_KIND.GENERIC_OAUTH]: 'https://grafana.example.com/login/generic_oauth',
  },
  allowLocalOidc: false,
};

const activeProvider: OIDCProvider = {
  providerKey: 'google',
  displayName: 'Google',
  issuerUrl: 'https://accounts.google.com',
  clientId: 'client',
  scopes: 'openid profile email',
  enabled: true,
  secretConfigured: true,
  databaseSourceActive: true,
  grafanaSyncStatus: OIDC_PROVIDER_SYNC_STATUS.SYNCHRONIZED,
  grafanaSyncedRevision: 1,
  providerRevision: 1,
  hasCandidate: false,
  grafanaTarget: GRAFANA_PROVIDER_KIND.GOOGLE,
  devlakeCallbackUrl: callbacks.devlakeCallbackUrl,
  grafanaCallbackUrl: callbacks.grafanaCallbackUrls[GRAFANA_PROVIDER_KIND.GOOGLE],
  allowLocalOidc: false,
};

describe('SettingsAuthentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.listOIDCProviders.mockReset();
    access.getOIDCCallbacks.mockReset();
    access.listOIDCProviders.mockResolvedValue([]);
    access.getOIDCCallbacks.mockResolvedValue(callbacks);
  });

  const retryFromUnavailable = async (expectedState: string) => {
    renderWithTheme(<SettingsAuthentication />);

    await waitFor(() => expect(screen.getByText(COPY.stateUnavailable)).toBeTruthy());
    expect(screen.queryByText(AUTHENTICATION_STATE.NO_MANAGED_OIDC)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.retry }));

    await waitFor(() => expect(screen.getByText(expectedState)).toBeTruthy());
    expect(access.listOIDCProviders).toHaveBeenCalledTimes(2);
  };

  it('shows loading until the provider response arrives, then recognizes a successful empty response', async () => {
    let pending: Promise<OIDCProvider[]> | undefined;
    let resolveProviders: (providers: OIDCProvider[]) => void = (_providers: OIDCProvider[]): void => {
      throw new Error('Provider request has not started.');
    };
    access.listOIDCProviders.mockImplementationOnce(() => {
      pending = new Promise<OIDCProvider[]>((resolve) => {
        resolveProviders = resolve;
      });
      return pending;
    });

    renderWithTheme(<SettingsAuthentication />);

    try {
      expect(screen.getByText(COPY.stateLoading)).toBeTruthy();
      expect(screen.queryByText(AUTHENTICATION_STATE.NO_MANAGED_OIDC)).toBeNull();
      await waitFor(() => expect(access.listOIDCProviders).toHaveBeenCalledOnce());

      await act(async () => resolveProviders([]));

      await waitFor(() => expect(screen.getByText(AUTHENTICATION_STATE.NO_MANAGED_OIDC)).toBeTruthy());
      expect(screen.queryByText(COPY.stateLoading)).toBeNull();
    } finally {
      const pendingRequest = pending;
      if (pendingRequest) {
        await act(async () => {
          resolveProviders([]);
          await pendingRequest;
        });
      }
    }
  });

  it('shows unavailable after provider failure and retries into the loaded authentication state', async () => {
    access.listOIDCProviders.mockRejectedValueOnce(new Error('private provider detail'));
    access.listOIDCProviders.mockResolvedValueOnce([activeProvider]);

    await retryFromUnavailable(AUTHENTICATION_STATE.OIDC_ACTIVE);
    expect(screen.queryByText('private provider detail')).toBeNull();
  });

  it('treats an outer refresh error as unavailable and keeps retry available', async () => {
    access.listOIDCProviders.mockImplementationOnce(() => {
      throw new Error('request setup failed');
    });

    await retryFromUnavailable(AUTHENTICATION_STATE.NO_MANAGED_OIDC);
    expect(screen.queryByText('request setup failed')).toBeNull();
  });
});
