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

import { Input } from 'antd';

import { Block } from '@/components/block';
import type { ConnectionFieldRenderProps } from '@/types';

import type { SalesforceConnectionValues } from '../types';

type RenderProps = ConnectionFieldRenderProps<SalesforceConnectionValues>;

type CredentialKey = 'instanceUrl' | 'accessToken' | 'clientId' | 'clientSecret' | 'refreshToken';

type Options = {
  key: CredentialKey;
  title: string;
  name: string;
  placeholder: string;
  password?: boolean;
  authMode: 'access_token' | 'refresh_token';
  requiredMessage: string;
};

export const validateConnection = (values: SalesforceConnectionValues) => {
  const authMode = values.authMode ?? 'access_token';

  return {
    instanceUrl: authMode === 'access_token' && !(values.instanceUrl ?? '').trim() ? 'required' : '',
    accessToken: authMode === 'access_token' && !(values.accessToken ?? '').trim() ? 'required' : '',
    refreshToken: authMode === 'refresh_token' && !(values.refreshToken ?? '').trim() ? 'required' : '',
    clientId: authMode === 'refresh_token' && !(values.clientId ?? '').trim() ? 'required' : '',
    clientSecret: authMode === 'refresh_token' && !(values.clientSecret ?? '').trim() ? 'required' : '',
  };
};

export const getConnectionValues = (initialValues: SalesforceConnectionValues, values: SalesforceConnectionValues) => ({
  ...initialValues,
  ...values,
});

export const credentialField = ({ key, title, name, placeholder, password, authMode, requiredMessage }: Options) =>
  function CredentialField({ initialValues, values, errors, setValues, setErrors }: RenderProps) {
    const formValues = getConnectionValues(initialValues, values);
    const Field = password ? Input.Password : Input;

    return (formValues.authMode ?? 'access_token') === authMode ? (
      <Block key={key} title={title} required>
        <Field
          name={name}
          autoComplete={password ? 'new-password' : 'off'}
          placeholder={placeholder}
          value={formValues[key] ?? ''}
          status={errors[key] ? 'error' : undefined}
          onChange={(e) => {
            const nextValues = { ...formValues, [key]: e.target.value };
            setValues({ [key]: e.target.value });
            setErrors(validateConnection(nextValues));
          }}
        />
        {!!errors[key] && <p style={{ color: '#ff4d4f', marginTop: 8 }}>{requiredMessage}</p>}
      </Block>
    ) : null;
  };
