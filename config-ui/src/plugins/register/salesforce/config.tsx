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
import {
  ACCESS_TOKEN_FIELDS,
  REFRESH_TOKEN_FIELDS,
  credentialField,
  getConnectionValues,
  validateConnection,
} from './connection-fields/credential-field';
import { SALESFORCE_AUTH_MODE } from './constants';
import type { SalesforceAuthMode, SalesforceConnectionValues } from './types';

type RenderProps = ConnectionFieldRenderProps<SalesforceConnectionValues>;

const authModeOptions: Array<{ label: string; value: SalesforceAuthMode }> = [
  { label: 'Access Token', value: SALESFORCE_AUTH_MODE.ACCESS_TOKEN },
  { label: 'Refresh Token', value: SALESFORCE_AUTH_MODE.REFRESH_TOKEN },
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
      authMode: SALESFORCE_AUTH_MODE.ACCESS_TOKEN,
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
        const { authMode, instanceUrl, loginUrl } = formValues;

        return (
          <Block key="authMode" title="Authentication Mode" required>
            <Select
              style={{ width: '100%' }}
              value={authMode ?? SALESFORCE_AUTH_MODE.ACCESS_TOKEN}
              options={authModeOptions}
              onChange={(value) => {
                const changedValues: SalesforceConnectionValues = { authMode: value };
                if (value === SALESFORCE_AUTH_MODE.REFRESH_TOKEN && instanceUrl) {
                  changedValues.loginUrl = instanceUrl;
                }
                if (value === SALESFORCE_AUTH_MODE.ACCESS_TOKEN && loginUrl) {
                  changedValues.instanceUrl = loginUrl;
                }
                const nextValues = { ...formValues, ...changedValues };
                setValues(changedValues);
                setErrors(validateConnection(nextValues));
              }}
            />
          </Block>
        );
      },
      ...ACCESS_TOKEN_FIELDS.map(credentialField),
      ({ initialValues, values, setValues }: RenderProps) => {
        const { authMode, loginUrl } = getConnectionValues(initialValues, values);

        return (
          (authMode ?? SALESFORCE_AUTH_MODE.ACCESS_TOKEN) === SALESFORCE_AUTH_MODE.REFRESH_TOKEN && (
            <Block key="loginUrl" title="Login URL">
              <Input
                name="salesforce-login-url"
                autoComplete="off"
                placeholder="https://login.salesforce.com"
                value={loginUrl ?? ''}
                onChange={(e) => setValues({ loginUrl: e.target.value })}
              />
              <p style={{ margin: '4px 0 0', color: '#7a7a7a', fontSize: 12 }}>
                Use <code>https://test.salesforce.com</code> for sandbox refresh-token authentication.
              </p>
            </Block>
          )
        );
      },
      ...REFRESH_TOKEN_FIELDS.map(credentialField),
      ({ initialValues, values, setValues }: RenderProps) => {
        const { apiVersion } = getConnectionValues(initialValues, values);

        return (
          <Block key="apiVersion" title="API Version">
            <Input
              name="salesforce-api-version"
              autoComplete="off"
              placeholder="v61.0"
              value={apiVersion ?? ''}
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
