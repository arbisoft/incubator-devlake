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
import { IPluginConfig } from '@/types';

import Icon from '../claude/assets/icon.svg?react';

export const ClaudeEnterpriseConfig: IPluginConfig = {
  plugin: 'claude_enterprise',
  name: 'Claude Enterprise',
  icon: ({ color }) => <Icon fill={color} />,
  sort: 6.7,
  isBeta: true,
  connection: {
    docLink: 'https://platform.claude.com/docs/en/manage-claude/analytics-api',
    initialValues: {
      endpoint: 'https://api.anthropic.com/v1',
      organizationId: '',
      token: '',
      rateLimitPerHour: 2400,
    },
    fields: [
      'name',
      'endpoint',
      ({ values, setValues }: any) => (
        <Block key="organizationId" title="Organization ID">
          <Input
            placeholder="org-xxxxxxxxxxxxxxxx"
            value={values.organizationId ?? ''}
            onChange={(e) => setValues({ organizationId: e.target.value })}
          />
          <p style={{ margin: '4px 0 0', color: '#7a7a7a', fontSize: 12 }}>
            Required to create the DevLake organization scope before live API validation. DevLake will not invent a
            remote scope when this is empty.
          </p>
        </Block>
      ),
      {
        key: 'token',
        label: 'Analytics API Key',
        subLabel: (
          <>
            Use a Claude Enterprise <strong>Analytics API key</strong> created by a <strong>Primary Owner</strong> with
            the <code>read:analytics</code> scope. Learn more in the{' '}
            <a href="https://platform.claude.com/docs/en/manage-claude/analytics-api" target="_blank" rel="noreferrer">
              Analytics API docs
            </a>
            . This is different from the Claude Console Admin API key used by the regular Claude plugin.
          </>
        ),
      },
      'proxy',
      {
        key: 'rateLimitPerHour',
        subLabel:
          'By default, DevLake uses 2,400 requests/hour for Claude Enterprise Analytics, below the documented organization-wide limit.',
        defaultValue: 2400,
      },
    ],
  },
  dataScope: {
    title: 'Organizations',
    searchPlaceholder: 'Search Claude Enterprise organizations',
  },
  scopeConfig: {
    entities: ['CROSS'],
    transformation: {},
  },
};
