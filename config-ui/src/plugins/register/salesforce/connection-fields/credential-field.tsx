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

import { SALESFORCE_AUTH_MODE } from '../constants';
import type { SalesforceAuthMode, SalesforceConnectionValues } from '../types';

type RenderProps = ConnectionFieldRenderProps<SalesforceConnectionValues>;

type CredentialKey = 'instanceUrl' | 'accessToken' | 'clientId' | 'clientSecret' | 'refreshToken';

type Options = {
  key: CredentialKey;
  title: string;
  name: string;
  placeholder: string;
  password?: boolean;
  authMode: SalesforceAuthMode;
  requiredMessage: string;
};

export const ACCESS_TOKEN_FIELDS: Options[] = [
  {
    key: 'instanceUrl',
    title: 'Instance URL',
    name: 'salesforce-instance-url',
    placeholder: 'https://your-instance.my.salesforce.com',
    authMode: SALESFORCE_AUTH_MODE.ACCESS_TOKEN,
    requiredMessage: 'Instance URL is required.',
  },
  {
    key: 'accessToken',
    title: 'Access Token',
    name: 'salesforce-access-token',
    placeholder: 'Salesforce access token',
    password: true,
    authMode: SALESFORCE_AUTH_MODE.ACCESS_TOKEN,
    requiredMessage: 'Access token is required.',
  },
];

export const REFRESH_TOKEN_FIELDS: Options[] = [
  {
    key: 'clientId',
    title: 'Client ID',
    name: 'salesforce-client-id',
    placeholder: 'Salesforce OAuth client ID',
    authMode: SALESFORCE_AUTH_MODE.REFRESH_TOKEN,
    requiredMessage: 'Client ID is required.',
  },
  {
    key: 'clientSecret',
    title: 'Client Secret',
    name: 'salesforce-client-secret',
    placeholder: 'Salesforce OAuth client secret',
    password: true,
    authMode: SALESFORCE_AUTH_MODE.REFRESH_TOKEN,
    requiredMessage: 'Client secret is required.',
  },
  {
    key: 'refreshToken',
    title: 'Refresh Token',
    name: 'salesforce-refresh-token',
    placeholder: 'Salesforce refresh token',
    password: true,
    authMode: SALESFORCE_AUTH_MODE.REFRESH_TOKEN,
    requiredMessage: 'Refresh token is required.',
  },
];

export const validateConnection = (values: SalesforceConnectionValues) => {
  const authMode = values.authMode ?? SALESFORCE_AUTH_MODE.ACCESS_TOKEN;

  return Object.fromEntries(
    [...ACCESS_TOKEN_FIELDS, ...REFRESH_TOKEN_FIELDS].map((field) => [
      field.key,
      authMode === field.authMode && !(values[field.key] ?? '').trim() ? 'required' : '',
    ]),
  ) as Record<CredentialKey, string>;
};

export const getConnectionValues = (initialValues: SalesforceConnectionValues, values: SalesforceConnectionValues) => ({
  ...initialValues,
  ...values,
});

export const credentialField = ({ key, title, name, placeholder, password, authMode, requiredMessage }: Options) =>
  function CredentialField({ initialValues, values, errors, setValues, setErrors }: RenderProps) {
    const formValues = getConnectionValues(initialValues, values);
    const Field = password ? Input.Password : Input;

    return (
      (formValues.authMode ?? SALESFORCE_AUTH_MODE.ACCESS_TOKEN) === authMode && (
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
      )
    );
  };
