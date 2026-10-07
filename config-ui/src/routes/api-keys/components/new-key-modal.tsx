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

import { ApiOutlined } from '@ant-design/icons';
import { Input, Select } from 'antd';
import { useMemo } from 'react';

import API from '@/api';
import { LINKS } from '@/config';
import { ExternalLink, FormField, FormModal, toUserMessage, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { COPY, DEFAULT_ALLOWED_PATH, DEFAULT_EXPIRATION, ERROR_MAP, EXPIRATION } from '../constants';
import { Fields, PathPrefix, PathRow } from '../styled';
import type { ExpirationKey, NewKeyForm } from '../types';
import { getExpiresAt, getPathPrefix } from '../utils';

import type { NewKeyModalProps } from './types';

const EXPIRATION_OPTIONS = Object.values(EXPIRATION).map((value) => ({
  value,
  label: COPY.expirationOptions[value],
}));

const INITIAL_FORM: NewKeyForm = { name: '', expiration: DEFAULT_EXPIRATION, allowedPath: DEFAULT_ALLOWED_PATH };

export const NewKeyModal = ({ open, onClose, onCreated }: NewKeyModalProps) => {
  const {
    values: form,
    setField,
    reset,
    setSaving,
    modalProps,
  } = useModalForm(INITIAL_FORM, {
    onClose,
    required: ['name', 'allowedPath'],
    disabledReason: COPY.create.disabledReason,
  });
  const prefix = useMemo(() => getPathPrefix(window.location.origin), []);
  const { name, expiration, allowedPath } = COPY.create;

  const submit = async () => {
    const [success, res] = await operator(
      () =>
        API.apiKey.create({
          name: form.name,
          expiredAt: getExpiresAt(form.expiration),
          allowedPath: form.allowedPath,
        }),
      { setOperating: setSaving, formatReason: (error) => toUserMessage(error, ERROR_MAP) },
    );
    if (success) {
      reset();
      onCreated(res.apiKey);
    }
  };

  return (
    <FormModal
      open={open}
      title={COPY.create.title}
      icon={<ApiOutlined aria-hidden />}
      submitLabel={COPY.create.submit}
      onSubmit={submit}
      {...modalProps}
    >
      <Fields>
        <FormField label={name.label} description={name.description} required>
          {(control) => (
            <Input
              {...control}
              size="large"
              placeholder={name.placeholder}
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
            />
          )}
        </FormField>
        <FormField label={expiration.label} description={expiration.description} required>
          {(control) => (
            <Select<ExpirationKey>
              id={control.id}
              aria-describedby={control['aria-describedby']}
              size="large"
              options={EXPIRATION_OPTIONS}
              value={form.expiration}
              onChange={(value) => setField('expiration', value)}
            />
          )}
        </FormField>
        <FormField
          label={allowedPath.label}
          description={
            <>
              {allowedPath.description} <ExternalLink href={LINKS.API}>{allowedPath.docsLink}</ExternalLink>
            </>
          }
          required
        >
          {(control) => (
            <PathRow>
              <PathPrefix>{prefix}</PathPrefix>
              <Input
                {...control}
                size="large"
                value={form.allowedPath}
                onChange={(event) => setField('allowedPath', event.target.value)}
              />
            </PathRow>
          )}
        </FormField>
      </Fields>
    </FormModal>
  );
};
