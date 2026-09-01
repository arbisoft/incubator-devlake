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

import { OIDC_PROVIDER_STATUS, OIDC_PROVIDER_SUCCESS } from './constants';
import { SectionHeader, SectionTitle } from './styled';
import {
  canActivateOIDCProvider,
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

const EMPTY_PROVIDER: OIDCProviderInput = {
  providerKey: '',
  displayName: '',
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
  scopes: 'openid profile email',
};

const formFromProvider = (provider?: OIDCProvider): OIDCProviderInput => ({
  providerKey: provider?.providerKey ?? '',
  displayName: provider?.displayName ?? '',
  issuerUrl: provider?.issuerUrl ?? '',
  clientId: provider?.clientId ?? '',
  clientSecret: '',
  scopes: provider?.scopes ?? EMPTY_PROVIDER.scopes,
});

const statusColor = (status: string) => {
  if (status === OIDC_PROVIDER_STATUS.ACTIVE) return 'green';
  if (status === OIDC_PROVIDER_STATUS.FAILED || status === OIDC_PROVIDER_STATUS.RECOVERY) return 'red';
  if (status === OIDC_PROVIDER_STATUS.CONFIGURED || status === OIDC_PROVIDER_STATUS.PENDING) return 'orange';
  return 'default';
};

const Callback = ({ label, value }: { label: string; value: string }) => (
  <Block title={label} description="Register this exact callback URL with the customer OIDC provider.">
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
  const [form, setForm] = useState<OIDCProviderInput>(() => formFromProvider(provider));
  const [operating, setOperating] = useState<Operation>();
  const [operationError, setOperationError] = useState<string>();
  const [operationSuccess, setOperationSuccess] = useState<string>();
  const providerVersion = `${provider?.providerKey ?? ''}:${provider?.providerRevision ?? 0}`;
  const status = getOIDCProviderStatus(provider);
  const validInput = isValidOIDCProviderInput(form);
  const hasProvider = Boolean(provider?.providerKey);

  useEffect(() => {
    setForm(formFromProvider(provider));
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
        setOperationSuccess('OIDC provider settings are valid.');
        return;
      }
      if (action === 'grafana-sync') message.success(OIDC_PROVIDER_SUCCESS.GRAFANA_SYNCHRONIZED);
      onRefresh();
      return;
    }
    setOperationError(getOIDCProviderError(result));
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
        <Tag color={statusColor(status)}>{status}</Tag>
      </SectionHeader>
      {!hasProvider && (
        <Message content="DevLake is using deployment-managed OIDC settings until you validate and activate a database provider." />
      )}
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
            disabled={provider?.databaseSourceActive}
            placeholder="google"
            onChange={(event) => updateField('providerKey', event.target.value)}
          />
        </Block>
        <Block title="Display name" required>
          <Input
            value={form.displayName}
            placeholder="Google"
            onChange={(event) => updateField('displayName', event.target.value)}
          />
        </Block>
        <Block title="Issuer URL" required>
          <Input
            value={form.issuerUrl}
            placeholder="https://accounts.google.com"
            disabled={provider?.databaseSourceActive}
            onChange={(event) => updateField('issuerUrl', event.target.value)}
          />
        </Block>
        <Block title="Client ID" required>
          <Input value={form.clientId} onChange={(event) => updateField('clientId', event.target.value)} />
        </Block>
        <Block
          title="Client secret"
          description={provider?.secretConfigured ? 'Enter a replacement secret to update this provider.' : undefined}
          required
        >
          <Input.Password
            value={form.clientSecret}
            onChange={(event) => updateField('clientSecret', event.target.value)}
          />
        </Block>
        <Block title="Scopes" description="The openid scope is required." required>
          <Input value={form.scopes} onChange={(event) => updateField('scopes', event.target.value)} />
        </Block>
        {operationError && <Alert type="error" showIcon message={operationError} />}
        {operationSuccess && <Alert type="success" showIcon message={operationSuccess} />}
        <Space wrap>
          <Button loading={operating === 'validate'} disabled={!validInput || Boolean(operating)} onClick={validate}>
            Validate
          </Button>
          <Button
            type="primary"
            loading={operating === 'save'}
            disabled={!validInput || Boolean(operating)}
            onClick={save}
          >
            Save provider
          </Button>
          {canActivateOIDCProvider(provider) && (
            <Popconfirm
              title="Activate database OIDC settings?"
              description="DevLake will stop using the deployment OIDC provider after this succeeds."
              okText="Activate"
              onConfirm={activate}
            >
              <Button loading={operating === 'activate'} disabled={Boolean(operating)} type="primary">
                Activate
              </Button>
            </Popconfirm>
          )}
          {(provider?.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.FAILED ||
            provider?.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED) && (
            <Button loading={operating === 'grafana-sync'} disabled={Boolean(operating)} onClick={retryGrafanaSync}>
              Retry Grafana synchronization
            </Button>
          )}
        </Space>
      </Space>
    </>
  );
};
