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

import { Input, Select } from 'antd';

import { Block } from '@/components/block';
import type { ConnectionFieldRenderProps, IPluginConfig } from '@/types';

import Icon from './assets/icon.svg?react';
import { credentialField, getConnectionValues, validateConnection } from './connection-fields/credential-field';
import type { SalesforceConnectionValues } from './types';

type RenderProps = ConnectionFieldRenderProps<SalesforceConnectionValues>;

const AUTH_MODE_OPTIONS = [
  { label: 'Access Token', value: 'access_token' },
  { label: 'Refresh Token', value: 'refresh_token' },
];

export const SalesforceConfig: IPluginConfig = {
  plugin: 'salesforce',
  name: 'Salesforce',
  icon: () => <Icon />,
  sort: 7.1,
  isBeta: true,
  connection: {
    docLink: 'https://developer.salesforce.com/docs/apis',
    initialValues: {
      authMode: 'access_token',
      loginUrl: '',
      instanceUrl: '',
      accessToken: '',
      refreshToken: '',
      clientId: '',
      clientSecret: '',
      apiVersion: '',
      rateLimitPerHour: 5000,
    },
    fields: [
      'name',
      ({ initialValues, values, setValues, setErrors }: RenderProps) => {
        const formValues = getConnectionValues(initialValues, values);

        return (
          <Block key="authMode" title="Authentication Mode" required>
            <Select
              style={{ width: '100%' }}
              value={formValues.authMode ?? 'access_token'}
              options={AUTH_MODE_OPTIONS}
              onChange={(value) => {
                const changedValues: SalesforceConnectionValues = { authMode: value };
                if (value === 'refresh_token' && formValues.instanceUrl) {
                  changedValues.loginUrl = formValues.instanceUrl;
                }
                if (value === 'access_token' && formValues.loginUrl) {
                  changedValues.instanceUrl = formValues.loginUrl;
                }
                const nextValues = { ...formValues, ...changedValues };
                setValues(changedValues);
                setErrors(validateConnection(nextValues));
              }}
            />
          </Block>
        );
      },
      credentialField({
        key: 'instanceUrl',
        title: 'Instance URL',
        name: 'salesforce-instance-url',
        placeholder: 'https://your-instance.my.salesforce.com',
        authMode: 'access_token',
        requiredMessage: 'Instance URL is required.',
      }),
      credentialField({
        key: 'accessToken',
        title: 'Access Token',
        name: 'salesforce-access-token',
        placeholder: 'Salesforce access token',
        password: true,
        authMode: 'access_token',
        requiredMessage: 'Access token is required.',
      }),
      ({ initialValues, values, setValues }: RenderProps) => {
        const formValues = getConnectionValues(initialValues, values);

        return (formValues.authMode ?? 'access_token') === 'refresh_token' ? (
          <Block key="loginUrl" title="Login URL">
            <Input
              name="salesforce-login-url"
              autoComplete="off"
              placeholder="https://login.salesforce.com"
              value={formValues.loginUrl ?? ''}
              onChange={(e) => setValues({ loginUrl: e.target.value })}
            />
            <p style={{ margin: '4px 0 0', color: '#7a7a7a', fontSize: 12 }}>
              Use <code>https://test.salesforce.com</code> for sandbox refresh-token authentication.
            </p>
          </Block>
        ) : null;
      },
      credentialField({
        key: 'clientId',
        title: 'Client ID',
        name: 'salesforce-client-id',
        placeholder: 'Salesforce OAuth client ID',
        authMode: 'refresh_token',
        requiredMessage: 'Client ID is required.',
      }),
      credentialField({
        key: 'clientSecret',
        title: 'Client Secret',
        name: 'salesforce-client-secret',
        placeholder: 'Salesforce OAuth client secret',
        password: true,
        authMode: 'refresh_token',
        requiredMessage: 'Client secret is required.',
      }),
      credentialField({
        key: 'refreshToken',
        title: 'Refresh Token',
        name: 'salesforce-refresh-token',
        placeholder: 'Salesforce refresh token',
        password: true,
        authMode: 'refresh_token',
        requiredMessage: 'Refresh token is required.',
      }),
      ({ initialValues, values, setValues }: RenderProps) => {
        const formValues = getConnectionValues(initialValues, values);

        return (
          <Block key="apiVersion" title="API Version">
            <Input
              name="salesforce-api-version"
              autoComplete="off"
              placeholder="v61.0"
              value={formValues.apiVersion ?? ''}
              onChange={(e) => setValues({ apiVersion: e.target.value })}
            />
          </Block>
        );
      },
      'proxy',
      {
        key: 'rateLimitPerHour',
        defaultValue: 5000,
      },
    ],
  },
  dataScope: {
    title: 'Organizations',
  },
  scopeConfig: {
    entities: ['CROSS'],
    transformation: {
      objectTypes: ['Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Task', 'Event'],
      useCdc: false,
    },
  },
};
