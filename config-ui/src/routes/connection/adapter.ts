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
import { createElement } from 'react';

import { OTEL_CONNECTION_STATUS, OTEL_CREDENTIAL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { PATHS } from '@/config';
import { countFailed, WEBHOOK_PLUGIN, type ConnectionHealthMap } from '@/features/connections';
import { INTEGRATION_CATEGORY, PLUGIN_CATALOG, getCatalogEntry } from '@/plugins/catalog';
import ClaudeCodeOtelIcon from '@/plugins/register/claude_otel/assets/icon.svg?react';
import type { IConnection, IPluginConfig, IWebhook } from '@/types';

import { COPY, OTEL_INTEGRATION_KEY } from './constants';
import type { IntegrationSummary, OtelCredentialSummary } from './types';

const OTEL_WEIGHT_OFFSET = 1;

type AdapterInput = {
  plugins: string[];
  connections: IConnection[];
  webhooks: IWebhook[];
  health: ConnectionHealthMap;
  otelConnections?: OtelConnectionResponse[];
  getConfig: (plugin: string) => IPluginConfig;
};

export const summarizeOtelCredentials = (connections: OtelConnectionResponse[] = []): OtelCredentialSummary =>
  connections.reduce<OtelCredentialSummary>(
    (summary, { recoveryRequired, restartRequired, credentials }) => {
      if (recoveryRequired) summary.recoveryRequired += 1;
      if (restartRequired) summary.restartRequired += 1;
      if (!restartRequired && !recoveryRequired) {
        summary.active += credentials.filter(({ status }) => status === OTEL_CREDENTIAL_STATUS.ACTIVE).length;
      }
      return summary;
    },
    { active: 0, restartRequired: 0, recoveryRequired: 0 },
  );

const toPluginSummary = (
  plugin: string,
  { connections, webhooks, health, getConfig }: AdapterInput,
): IntegrationSummary => {
  const config = getConfig(plugin);
  const { category, weight, beta } = getCatalogEntry(config);
  const owned = connections.filter((connection) => connection.plugin === plugin);
  const isWebhook = plugin === WEBHOOK_PLUGIN;
  return {
    key: plugin,
    name: config.name,
    icon: config.icon,
    category,
    weight,
    beta,
    deprecated: config.isDeprecated ?? false,
    connections: isWebhook ? webhooks.length : owned.length,
    failed: isWebhook ? 0 : countFailed(owned, health),
    docsHref: config.connection.docLink || undefined,
  };
};

const toOtelSummary = (otelConnections: OtelConnectionResponse[] | undefined): IntegrationSummary => ({
  key: OTEL_INTEGRATION_KEY,
  name: COPY.otelName,
  icon: () => createElement(ClaudeCodeOtelIcon),
  category: INTEGRATION_CATEGORY.AI_ANALYTICS,
  weight: PLUGIN_CATALOG.claude_code.weight + OTEL_WEIGHT_OFFSET,
  beta: false,
  deprecated: false,
  connections: (otelConnections ?? []).filter(({ connection }) => connection.status === OTEL_CONNECTION_STATUS.ACTIVE)
    .length,
  failed: 0,
  href: PATHS.OTEL(),
  otel: summarizeOtelCredentials(otelConnections),
});

export const toIntegrationSummaries = (input: AdapterInput): IntegrationSummary[] => [
  ...input.plugins.map((plugin) => toPluginSummary(plugin, input)),
  toOtelSummary(input.otelConnections),
];
