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

import type { TableColumnsType } from 'antd';

import { GRAFANA_PROVIDER_KIND, type OIDCProvider } from '@/api/access';
import { IdentityCell, StatusBadge } from '@/ui';

import { getOIDCProviderStatus } from '../utils';

import { ProviderActions } from './components';
import { COPY, GRAFANA_PROVIDER_LABEL, OIDC_PROVIDER_STATUS_TONE, PROVIDER_COLUMN } from './constants';
import type { ProviderColumnActions } from './types';

const grafanaNote = (provider: OIDCProvider) => {
  if (provider.grafanaTarget === GRAFANA_PROVIDER_KIND.GENERIC_OAUTH) return COPY.selectedGenericOAuth;
  return provider.grafanaTarget === GRAFANA_PROVIDER_KIND.NONE ? COPY.grafanaOwnLogin : undefined;
};

export const getProviderColumns = (actions: ProviderColumnActions): TableColumnsType<OIDCProvider> => [
  {
    key: PROVIDER_COLUMN.PROVIDER,
    title: COPY.columns.provider,
    render: (_, provider) => <IdentityCell primary={provider.displayName} secondary={provider.providerKey} />,
  },
  {
    key: PROVIDER_COLUMN.DEVLAKE,
    title: COPY.columns.devlake,
    render: (_, provider) => {
      const status = getOIDCProviderStatus(provider);
      return <StatusBadge tone={OIDC_PROVIDER_STATUS_TONE[status]} label={status} variant="dot" />;
    },
  },
  {
    key: PROVIDER_COLUMN.GRAFANA,
    title: COPY.columns.grafana,
    render: (_, provider) => (
      <IdentityCell primary={GRAFANA_PROVIDER_LABEL[provider.grafanaTarget]} secondary={grafanaNote(provider)} />
    ),
  },
  {
    key: PROVIDER_COLUMN.ACTIONS,
    title: COPY.columns.actions,
    align: 'right',
    render: (_, provider) => <ProviderActions provider={provider} {...actions} />,
  },
];
