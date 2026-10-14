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

import { message } from 'antd';
import { useCallback, useState } from 'react';

import API from '@/api';
import type { OIDCProvider } from '@/api/access';
import { useConfirmFlow } from '@/ui/hooks';
import { operator } from '@/utils';

import { getOIDCProviderError } from '../utils';

import { COPY, OIDC_PROVIDER_MESSAGE, PROVIDER_ACTION, PROVIDER_CONFIRM } from './constants';
import type { ProviderAction, ProviderOperation } from './types';

type Pending = { action: ProviderAction; provider: OIDCProvider };

const REQUESTS: Record<ProviderAction, (providerKey: string) => Promise<unknown>> = {
  [PROVIDER_ACTION.ACTIVATE]: (key) => API.access.activateOIDCProvider(key),
  [PROVIDER_ACTION.ENABLE]: (key) => API.access.enableOIDCProvider(key),
  [PROVIDER_ACTION.DISABLE]: (key) => API.access.disableOIDCProvider(key),
  [PROVIDER_ACTION.RETIRE]: (key) => API.access.retireOIDCProvider(key),
  [PROVIDER_ACTION.GRAFANA_SYNC]: (key) => API.access.retryGrafanaOIDCProviderSync(key),
  [PROVIDER_ACTION.SELECT_GENERIC]: (key) => API.access.selectGenericOIDCProvider(key),
};

const resolve = ({ action, provider }: Pending) => ({
  config: PROVIDER_CONFIRM[action],
  name: provider.displayName,
});

export const useProviderActions = ({ onDone }: { onDone: () => void }) => {
  const [operating, setOperating] = useState<ProviderOperation>();
  const [error, setError] = useState<string>();

  const run = useCallback(
    async ({ action, provider }: Pending, setLoading: (loading: boolean) => void) => {
      setError(undefined);
      const { providerKey } = provider;
      const [success, result] = await operator(() => REQUESTS[action](providerKey), {
        hideToast: true,
        setOperating: (active) => {
          setLoading(active);
          setOperating(active ? { action, providerKey } : undefined);
        },
        formatReason: getOIDCProviderError,
      });
      if (success) {
        message.success(
          action === PROVIDER_ACTION.GRAFANA_SYNC ? OIDC_PROVIDER_MESSAGE.GRAFANA_SYNCHRONIZED : COPY.updated,
        );
      } else {
        setError(getOIDCProviderError(result));
      }
      onDone();
      return true;
    },
    [onDone],
  );

  const clearError = useCallback(() => setError(undefined), []);

  const { request, confirmProps } = useConfirmFlow({ resolve, run });

  const start = useCallback(
    (action: ProviderAction, provider: OIDCProvider) => request({ action, provider }),
    [request],
  );
  const isActionOperating = useCallback(
    (action: ProviderAction, providerKey: string) =>
      operating?.action === action && operating.providerKey === providerKey,
    [operating],
  );

  return { start, confirmProps, error, clearError, isOperating: operating !== undefined, isActionOperating };
};
