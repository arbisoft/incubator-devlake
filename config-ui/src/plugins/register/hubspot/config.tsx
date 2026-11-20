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

import type { HubspotConnectionValues } from './types';

type RenderProps = ConnectionFieldRenderProps<HubspotConnectionValues>;

export const HubspotConfig: IPluginConfig = {
  plugin: 'hubspot',
  name: 'HubSpot',
  icon: ({ color }) => <Icon fill={color} />,
  sort: 6.9,
  isBeta: true,
  connection: {
    docLink: 'https://developers.hubspot.com/docs/api/webhooks',
    initialValues: {
      endpoint: 'https://api.hubapi.com',
      token: '',
      portalId: '',
      enableWebhook: false,
      webhookSharedKey: '',
      rateLimitPerHour: 3600,
    },
    fields: [
      'name',
      'endpoint',
      {
        key: 'token',
        label: 'Private App Token',
      },
      ({ values, setValues }: RenderProps) => (
        <Block key="portalId" title="Portal ID">
          <Input
            placeholder="HubSpot portal ID"
            value={values.portalId ?? ''}
            onChange={(e) => setValues({ portalId: e.target.value })}
          />
        </Block>
      ),
      ...webhookIngestionFields({
        plugin: 'hubspot',
        sharedKeyDescription: 'Use your HubSpot app client secret for signature verification (v1/v2/v3).',
        sharedKeyPlaceholder: 'HubSpot app client secret',
      }),
      'proxy',
      {
        key: 'rateLimitPerHour',
        defaultValue: 3600,
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
