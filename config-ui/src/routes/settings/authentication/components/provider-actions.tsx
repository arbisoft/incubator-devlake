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

import { Button, Space, Tooltip } from 'antd';

import { OIDC_PROVIDER_SYNC_STATUS } from '@/api/access';

import { canActivateOIDCProvider, canSelectGenericOIDCProvider } from '../../utils';
import { COPY, PROVIDER_ACTION } from '../constants';
import type { ProviderAction, ProviderActionsProps } from '../types';

const SYNC_FAILED: string[] = [OIDC_PROVIDER_SYNC_STATUS.FAILED, OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED];

export const ProviderActions = ({
  provider,
  enabledProviderCount,
  isOperating,
  isActionOperating,
  onEdit,
  onAction,
}: ProviderActionsProps) => {
  const { displayName, providerKey, enabled, hasCandidate } = provider;
  const settled = !hasCandidate;
  const isLastEnabled = enabledProviderCount <= 1;

  const action = (kind: ProviderAction, label: string, extra: { primary?: boolean; danger?: boolean } = {}) => (
    <Button
      size="small"
      type={extra.primary ? 'primary' : undefined}
      danger={extra.danger}
      aria-label={COPY.actions.labelFor(label, displayName)}
      loading={isActionOperating(kind, providerKey)}
      disabled={isOperating}
      onClick={() => onAction(kind, provider)}
    >
      {label}
    </Button>
  );

  const disable = isLastEnabled ? (
    <Tooltip title={COPY.lastEnabled}>
      <span>
        <Button size="small" disabled aria-label={COPY.actions.labelFor(COPY.actions.disable, displayName)}>
          {COPY.actions.disable}
        </Button>
      </span>
    </Tooltip>
  ) : (
    action(PROVIDER_ACTION.DISABLE, COPY.actions.disable)
  );

  return (
    <Space wrap size="small">
      <Button
        size="small"
        aria-label={COPY.actions.labelFor(COPY.actions.edit, displayName)}
        onClick={() => onEdit(provider)}
      >
        {COPY.actions.edit}
      </Button>
      {canActivateOIDCProvider(provider) && action(PROVIDER_ACTION.ACTIVATE, COPY.actions.activate, { primary: true })}
      {enabled && settled && disable}
      {!enabled && settled && action(PROVIDER_ACTION.ENABLE, COPY.actions.enable)}
      {canSelectGenericOIDCProvider(provider) && action(PROVIDER_ACTION.SELECT_GENERIC, COPY.actions.useInGrafana)}
      {settled &&
        SYNC_FAILED.includes(provider.grafanaSyncStatus) &&
        action(PROVIDER_ACTION.GRAFANA_SYNC, COPY.actions.retryGrafana)}
      {!enabled && settled && action(PROVIDER_ACTION.RETIRE, COPY.actions.retire, { danger: true })}
    </Space>
  );
};
