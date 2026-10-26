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
import Icon from '@/images/plugin-icon.svg?react';
import { webhookIngestionFields } from '@/plugins/components/connection-form/fields/webhook-ingestion';
import type { ConnectionFieldRenderProps, IPluginConfig } from '@/types';

import type { NotionConnectionValues } from './types';

type RenderProps = ConnectionFieldRenderProps<NotionConnectionValues>;

export const NotionConfig: IPluginConfig = {
  plugin: 'notion',
  name: 'Notion',
  icon: ({ color }) => <Icon fill={color} />,
  sort: 7.0,
  isBeta: true,
  connection: {
    docLink: 'https://developers.notion.com/reference/webhooks',
    initialValues: {
      endpoint: 'https://api.notion.com',
      token: '',
      workspaceId: '',
      apiVersion: '2026-03-11',
      enableWebhook: false,
      webhookSharedKey: '',
      rateLimitPerHour: 10800,
    },
    fields: [
      'name',
      'endpoint',
      {
        key: 'token',
        label: 'Internal Integration Token',
      },
      ({ values, setValues }: RenderProps) => (
        <Block key="workspaceId" title="Workspace ID">
          <Input
            placeholder="Notion workspace ID"
            value={values.workspaceId ?? ''}
            onChange={(e) => setValues({ workspaceId: e.target.value })}
          />
        </Block>
      ),
      ({ values, setValues }: RenderProps) => (
        <Block key="apiVersion" title="Notion API Version">
          <Input
            placeholder="2026-03-11"
            value={values.apiVersion ?? ''}
            onChange={(e) => setValues({ apiVersion: e.target.value })}
          />
        </Block>
      ),
      ...webhookIngestionFields({
        plugin: 'notion',
        sharedKeyDescription: 'Use Notion webhook verification_token for HMAC signature validation.',
        sharedKeyPlaceholder: 'Notion verification token',
      }),
      'proxy',
      {
        key: 'rateLimitPerHour',
        defaultValue: 10800,
      },
    ],
  },
  dataScope: {
    title: 'Scopes',
  },
  scopeConfig: {
    entities: ['CROSS'],
    transformation: {},
  },
};
