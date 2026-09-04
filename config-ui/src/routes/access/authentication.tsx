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

import { useEffect, useMemo, useState } from 'react';
import { CopyOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Popconfirm, Space, Tag, Tooltip, message } from 'antd';
import { CopyToClipboard } from 'react-copy-to-clipboard';

import API from '@/api';
import { OIDC_PROVIDER_SYNC_STATUS, type OIDCProvider, type OIDCProviderInput } from '@/api/access';
import { Block, Message } from '@/components';
import { operator } from '@/utils';

import { OIDC_PROVIDER_MESSAGE, OIDC_PROVIDER_STATUS_COLOR } from './constants';
import { SectionHeader, SectionTitle } from './styled';
import {
  canActivateOIDCProvider,
  formFromOIDCProvider,
  getOIDCProviderError,
  getOIDCProviderStatus,
  isValidOIDCProviderInput,
  normalizeOIDCProviderInput,
} from './utils';

type Props = {
  provider?: OIDCProvider;
  loadFailed: boolean;
  onRefresh: () => void;
};

type Operation = 'validate' | 'save' | 'activate' | 'grafana-sync';

const Callback = ({ label, value }: { label: string; value: string }) => (
  <Block title={label} description={OIDC_PROVIDER_MESSAGE.CALLBACK_DESCRIPTION}>
    <Input
      readOnly
      value={value || 'Deployment public URL is not configured.'}
      addonAfter={
        value ? (
          <CopyToClipboard text={value} onCopy={() => message.success('Callback URL copied.')}>
            <Tooltip title={`Copy ${label}`}>
              <Button type="text" icon={<CopyOutlined />} aria-label={`Copy ${label}`} />
            </Tooltip>
          </CopyToClipboard>
        ) : undefined
      }
    />
  </Block>
);

export const Authentication = ({ provider, loadFailed, onRefresh }: Props) => {
  const [form, setForm] = useState<OIDCProviderInput>(() => formFromOIDCProvider(provider));
  const [operating, setOperating] = useState<Operation>();
  const [operationError, setOperationError] = useState<string>();
  const [operationSuccess, setOperationSuccess] = useState<string>();
  const providerVersion = `${provider?.providerKey ?? ''}:${provider?.providerRevision ?? 0}`;
  const status = getOIDCProviderStatus(provider);
  const validInput = isValidOIDCProviderInput(form, provider);
  const requiresReplacementSecret = !provider?.secretConfigured || form.clientId.trim() !== provider.clientId;
  const hasProvider = Boolean(provider?.providerKey);
  const isOperating = Boolean(operating);

  useEffect(() => {
    setForm(formFromOIDCProvider(provider));
    setOperationError(undefined);
    setOperationSuccess(undefined);
  }, [providerVersion]);

  const normalizedInput = useMemo(() => normalizeOIDCProviderInput(form), [form]);

  const updateField = <Key extends keyof OIDCProviderInput>(field: Key, value: OIDCProviderInput[Key]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setOperationError(undefined);
    setOperationSuccess(undefined);
  };

  const execute = async (action: Operation, request: () => Promise<unknown>) => {
    setOperationError(undefined);
    setOperationSuccess(undefined);
    const [success, result] = await operator(request, {
      hideToast: true,
      setOperating: (active) => setOperating(active ? action : undefined),
      formatReason: getOIDCProviderError,
    });
    if (success) {
      if (action === 'validate') {
        setOperationSuccess(OIDC_PROVIDER_MESSAGE.VALIDATED);
        return;
      }
      if (action === 'grafana-sync') message.success(OIDC_PROVIDER_MESSAGE.GRAFANA_SYNCHRONIZED);
      onRefresh();
      return;
    }
    setOperationError(getOIDCProviderError(result));
    if (action === 'activate' || action === 'grafana-sync') onRefresh();
  };

  const validate = () => execute('validate', () => API.access.validateOIDCProvider(normalizedInput));
  const save = () => execute('save', () => API.access.saveOIDCProvider(normalizedInput));
  const activate = () => execute('activate', () => API.access.activateOIDCProvider());
  const retryGrafanaSync = () => execute('grafana-sync', () => API.access.retryGrafanaOIDCProviderSync());

  if (loadFailed) {
    return (
      <>
        <SectionHeader $spaced>
          <SectionTitle>Authentication</SectionTitle>
        </SectionHeader>
        <Alert
          type="error"
          showIcon
          message="Authentication settings could not be loaded. Refresh the page and try again."
        />
      </>
    );
  }

  return (
    <>
      <SectionHeader $spaced>
        <SectionTitle>Authentication</SectionTitle>
        <Tag color={OIDC_PROVIDER_STATUS_COLOR[status] ?? 'default'}>{status}</Tag>
      </SectionHeader>
      {!hasProvider && <Message content={OIDC_PROVIDER_MESSAGE.DEPLOYMENT_MANAGED} />}
      <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
        <Callback label="DevLake callback URL" value={provider?.devlakeCallbackUrl ?? ''} />
        <Callback label="Grafana callback URL" value={provider?.grafanaCallbackUrl ?? ''} />
        <Block
          title="Provider key"
          description="Use a stable lowercase identifier. It cannot change after activation."
          required
        >
          <Input
            value={form.providerKey}
            disabled={isOperating || provider?.databaseSourceActive}
            placeholder="google"
            onChange={(event) => updateField('providerKey', event.target.value)}
          />
        </Block>
        <Block title="Display name" required>
          <Input
            value={form.displayName}
            disabled={isOperating}
            placeholder="Google"
            onChange={(event) => updateField('displayName', event.target.value)}
          />
        </Block>
        <Block title="Issuer URL" required>
          <Input
            value={form.issuerUrl}
            placeholder="https://accounts.google.com"
            disabled={isOperating || provider?.databaseSourceActive}
            onChange={(event) => updateField('issuerUrl', event.target.value)}
          />
        </Block>
        <Block title="Client ID" required>
          <Input
            value={form.clientId}
            disabled={isOperating}
            onChange={(event) => updateField('clientId', event.target.value)}
          />
        </Block>
        <Block
          title="Client secret"
          description={provider?.secretConfigured ? OIDC_PROVIDER_MESSAGE.SECRET_REPLACEMENT_REQUIRED : undefined}
          required={requiresReplacementSecret}
        >
          <Input.Password
            value={form.clientSecret}
            disabled={isOperating}
            onChange={(event) => updateField('clientSecret', event.target.value)}
          />
        </Block>
        <Block title="Scopes" description="The openid scope is required." required>
          <Input
            value={form.scopes}
            disabled={isOperating}
            onChange={(event) => updateField('scopes', event.target.value)}
          />
        </Block>
        {provider?.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED && (
          <Alert type="warning" showIcon message={OIDC_PROVIDER_MESSAGE.RECOVERY_REQUIRED} />
        )}
        {provider?.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.COMPENSATED && (
          <Alert type="warning" showIcon message={OIDC_PROVIDER_MESSAGE.ACTIVATION_COMPENSATED} />
        )}
        {operationError && <Alert type="error" showIcon message={operationError} />}
        {operationSuccess && <Alert type="success" showIcon message={operationSuccess} />}
        <Space wrap>
          <Button loading={operating === 'validate'} disabled={!validInput || isOperating} onClick={validate}>
            Validate
          </Button>
          <Button type="primary" loading={operating === 'save'} disabled={!validInput || isOperating} onClick={save}>
            Save provider
          </Button>
          {canActivateOIDCProvider(provider) && (
            <Popconfirm
              title={OIDC_PROVIDER_MESSAGE.ACTIVATE_TITLE}
              description={OIDC_PROVIDER_MESSAGE.ACTIVATE_DESCRIPTION}
              okText="Activate"
              onConfirm={activate}
            >
              <Button loading={operating === 'activate'} disabled={isOperating} type="primary">
                Activate
              </Button>
            </Popconfirm>
          )}
          {(provider?.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.FAILED ||
            provider?.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED) && (
            <Button loading={operating === 'grafana-sync'} disabled={isOperating} onClick={retryGrafanaSync}>
              Retry Grafana synchronization
            </Button>
          )}
        </Space>
      </Space>
    </>
  );
};
