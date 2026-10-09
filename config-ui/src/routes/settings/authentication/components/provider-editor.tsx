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

import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Select } from 'antd';
import { useMemo, useState } from 'react';

import API from '@/api';
import { GRAFANA_PROVIDER_KIND, OIDC_PROVIDER_SYNC_STATUS, type OIDCProviderInput } from '@/api/access';
import { FormField, FormModal, MODAL_WIDTH } from '@/ui';
import { operator } from '@/utils';

import { Fields, TextField } from '../../components';
import {
  formFromOIDCProvider,
  getOIDCProviderError,
  isValidOIDCProviderInput,
  normalizeOIDCProviderInput,
} from '../../utils';
import { COPY, GRAFANA_PROVIDER_OPTIONS, OIDC_PROVIDER_MESSAGE } from '../constants';

import { CallbackField } from './callback-field';
import { ValidateRow } from './styled';
import type { ProviderEditorProps } from './types';

type Feedback = { type: 'error' | 'success'; message: string };

const copy = COPY.editor;

export const ProviderEditor = ({ open, provider, callbacks, onClose, onSaved }: ProviderEditorProps) => {
  const [form, setForm] = useState<OIDCProviderInput>(() => formFromOIDCProvider(provider));
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [synced, setSynced] = useState({ open, provider });
  const isOperating = validating || saving;
  const normalizedInput = useMemo(() => normalizeOIDCProviderInput(form), [form]);
  const validInput = isValidOIDCProviderInput(form, provider, provider?.allowLocalOidc ?? callbacks?.allowLocalOidc);
  const requiresReplacementSecret = !provider?.secretConfigured || form.clientId.trim() !== provider.clientId;
  const isExisting = provider !== undefined;

  if (synced.open !== open || synced.provider !== provider) {
    setSynced({ open, provider });
    setFeedback(undefined);
    setForm((current) => (open ? formFromOIDCProvider(provider) : { ...current, clientSecret: '' }));
  }

  const updateField = <Key extends keyof OIDCProviderInput>(field: Key, value: OIDCProviderInput[Key]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFeedback(undefined);
  };

  const submit = async (
    request: (input: OIDCProviderInput) => Promise<unknown>,
    setOperating: (active: boolean) => void,
  ) => {
    setFeedback(undefined);
    const [success, result] = await operator(() => request(normalizedInput), {
      hideToast: true,
      setOperating,
      formatReason: getOIDCProviderError,
    });
    if (!success) setFeedback({ type: 'error', message: getOIDCProviderError(result) });
    return success;
  };

  const handleValidate = async () => {
    if (await submit((input) => API.access.validateOIDCProvider(input), setValidating)) {
      setFeedback({ type: 'success', message: OIDC_PROVIDER_MESSAGE.VALIDATED });
    }
  };

  const handleSave = async () => {
    if (await submit((input) => API.access.saveOIDCProvider(input), setSaving)) onSaved();
  };

  return (
    <FormModal
      open={open}
      title={provider ? copy.editTitle(provider.displayName) : copy.addTitle}
      icon={<SafetyCertificateOutlined aria-hidden />}
      submitLabel={copy.submit}
      width={MODAL_WIDTH.LG}
      loading={saving}
      submitDisabled={!validInput || isOperating}
      disabledReason={copy.disabledReason}
      onSubmit={handleSave}
      onCancel={() => {
        if (!isOperating) onClose();
      }}
    >
      <Fields>
        <CallbackField
          label={COPY.callback.devlake}
          value={provider?.devlakeCallbackUrl ?? callbacks?.devlakeCallbackUrl ?? ''}
        />
        <CallbackField
          label={COPY.callback.grafana}
          value={provider?.grafanaCallbackUrl ?? callbacks?.grafanaCallbackUrls[form.grafanaTarget] ?? ''}
        />
        <TextField
          label={copy.providerKey.label}
          description={copy.providerKey.description}
          placeholder={copy.providerKey.placeholder}
          value={form.providerKey}
          required
          disabled={isOperating || isExisting}
          onChange={(value) => updateField('providerKey', value)}
        />
        <TextField
          label={copy.displayName.label}
          placeholder={copy.displayName.placeholder}
          value={form.displayName}
          required
          disabled={isOperating}
          onChange={(value) => updateField('displayName', value)}
        />
        <TextField
          label={copy.issuerUrl.label}
          placeholder={copy.issuerUrl.placeholder}
          value={form.issuerUrl}
          required
          disabled={isOperating || isExisting}
          onChange={(value) => updateField('issuerUrl', value)}
        />
        <TextField
          label={copy.clientId.label}
          value={form.clientId}
          required
          disabled={isOperating}
          onChange={(value) => updateField('clientId', value)}
        />
        <TextField
          secret
          label={copy.clientSecret.label}
          description={provider?.secretConfigured ? OIDC_PROVIDER_MESSAGE.SECRET_REPLACEMENT_REQUIRED : undefined}
          value={form.clientSecret}
          required={requiresReplacementSecret}
          disabled={isOperating}
          onChange={(value) => updateField('clientSecret', value)}
        />
        <TextField
          label={copy.scopes.label}
          description={copy.scopes.description}
          value={form.scopes}
          required
          disabled={isOperating}
          onChange={(value) => updateField('scopes', value)}
        />
        <FormField label={copy.grafanaTarget.label} description={copy.grafanaTarget.description} required>
          {(control) => (
            <Select
              {...control}
              size="large"
              value={form.grafanaTarget}
              disabled={isOperating || isExisting}
              options={GRAFANA_PROVIDER_OPTIONS}
              onChange={(value) => updateField('grafanaTarget', value)}
            />
          )}
        </FormField>
        {form.grafanaTarget === GRAFANA_PROVIDER_KIND.NONE && (
          <Checkbox
            checked={form.confirmDevlakeOnly}
            disabled={isOperating}
            onChange={(event) => updateField('confirmDevlakeOnly', event.target.checked)}
          >
            {copy.confirmDevlakeOnly}
          </Checkbox>
        )}
        {provider?.hasCandidate && <Alert type="info" showIcon title={copy.stagedRevision} />}
        {provider?.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED && (
          <Alert type="warning" showIcon title={OIDC_PROVIDER_MESSAGE.RECOVERY_REQUIRED} />
        )}
        <ValidateRow>
          <Button loading={validating} disabled={!validInput || isOperating} onClick={handleValidate}>
            {copy.validate}
          </Button>
        </ValidateRow>
        {feedback && <Alert type={feedback.type} showIcon title={feedback.message} />}
      </Fields>
    </FormModal>
  );
};
