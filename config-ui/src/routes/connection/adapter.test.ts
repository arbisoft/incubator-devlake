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
import { describe, expect, it } from 'vitest';

import { OTEL_CONNECTION_STATUS, OTEL_CREDENTIAL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { PATHS } from '@/config';
import type { ConnectionHealthMap } from '@/features/connections';
import { INTEGRATION_CATEGORY, PLUGIN_CATALOG } from '@/plugins/catalog';
import { IConnectionStatus, type IConnection, type IPluginConfig, type IWebhook } from '@/types';

import { summarizeOtelCredentials, toIntegrationSummaries } from './adapter';
import { COPY, OTEL_INTEGRATION_KEY } from './constants';

const NOW = 1_700_000_000_000;
const DOC_LINK = 'https://example.com/docs';

const config = (plugin: string, extra: Partial<IPluginConfig> = {}) =>
  ({
    plugin,
    name: plugin.toUpperCase(),
    icon: () => null,
    sort: 1,
    connection: { docLink: DOC_LINK, fields: [] },
    dataScope: {},
    ...extra,
  }) as IPluginConfig;

const configs: Record<string, IPluginConfig> = {
  github: config('github'),
  azuredevops: config('azuredevops', { isDeprecated: true }),
  codex: config('codex', { isBeta: true }),
  webhook: config('webhook', { connection: { docLink: '', fields: [] } }),
  mystery: config('mystery'),
};
const getConfig = (plugin: string) => configs[plugin];

const connection = (plugin: string, id: number) => ({ plugin, id, unique: `${plugin}-${id}` }) as IConnection;

const otel = (
  overrides: Partial<OtelConnectionResponse> = {},
  credentialStatuses: string[] = [OTEL_CREDENTIAL_STATUS.ACTIVE],
  status: string = OTEL_CONNECTION_STATUS.ACTIVE,
) =>
  ({
    connection: { status },
    credentials: credentialStatuses.map((credentialStatus) => ({ status: credentialStatus })),
    restartRequired: false,
    recoveryRequired: false,
    ...overrides,
  }) as OtelConnectionResponse;

const build = (input: Partial<Parameters<typeof toIntegrationSummaries>[0]> = {}) =>
  toIntegrationSummaries({
    plugins: ['github', 'azuredevops', 'codex', 'webhook', 'mystery'],
    connections: [],
    webhooks: [],
    health: {},
    getConfig,
    ...input,
  });

const find = (key: string, items = build()) => items.find((item) => item.key === key);

describe('summarizeOtelCredentials', () => {
  it('is empty without connections', () => {
    expect(summarizeOtelCredentials()).toEqual({ active: 0, restartRequired: 0, recoveryRequired: 0 });
  });

  it('counts only active credentials of ready connections', () => {
    const ready = otel({}, [
      OTEL_CREDENTIAL_STATUS.ACTIVE,
      OTEL_CREDENTIAL_STATUS.ACTIVE,
      OTEL_CREDENTIAL_STATUS.REVOKED,
      OTEL_CREDENTIAL_STATUS.RETIRING,
    ]);
    expect(summarizeOtelCredentials([ready]).active).toBe(2);
  });

  it('counts connections needing recovery or action instead of their credentials', () => {
    const summary = summarizeOtelCredentials([
      otel({ recoveryRequired: true }),
      otel({ restartRequired: true }),
      otel({ restartRequired: true, recoveryRequired: true }),
      otel(),
    ]);
    expect(summary).toEqual({ active: 1, restartRequired: 2, recoveryRequired: 2 });
  });
});

describe('toIntegrationSummaries', () => {
  it('gives each plugin its catalog category, weight and display fields', () => {
    expect(find('github')).toMatchObject({
      name: 'GITHUB',
      category: INTEGRATION_CATEGORY.CODE_SCM,
      weight: PLUGIN_CATALOG.github.weight,
      beta: false,
      deprecated: false,
      docsHref: DOC_LINK,
    });
  });

  it('flags beta and deprecated plugins from their config', () => {
    expect(find('codex')?.beta).toBe(true);
    expect(find('azuredevops')?.deprecated).toBe(true);
  });

  it('files a plugin with no catalog entry under the default category', () => {
    expect(find('mystery')?.category).toBe(INTEGRATION_CATEGORY.CUSTOM);
  });

  it('counts the connections of each plugin', () => {
    const items = build({ connections: [connection('github', 1), connection('github', 2), connection('codex', 1)] });
    expect(find('github', items)?.connections).toBe(2);
    expect(find('codex', items)?.connections).toBe(1);
    expect(find('azuredevops', items)?.connections).toBe(0);
  });

  it('counts failed connections from health only', () => {
    const health: ConnectionHealthMap = {
      'github-1': { status: IConnectionStatus.OFFLINE, testedAt: NOW },
      'github-2': { status: IConnectionStatus.ONLINE, testedAt: NOW },
    };
    const items = build({ connections: [connection('github', 1), connection('github', 2)], health });
    expect(find('github', items)?.failed).toBe(1);
  });

  it('counts webhooks for the webhook plugin and never reports them failed', () => {
    const items = build({ webhooks: [{ id: 1 }, { id: 2 }] as IWebhook[], connections: [connection('webhook', 1)] });
    expect(find('webhook', items)).toMatchObject({ connections: 2, failed: 0, docsHref: undefined });
  });

  it('adds the Claude Code OTel integration to the AI category, right after Claude Code', () => {
    const item = find(OTEL_INTEGRATION_KEY);
    expect(item).toMatchObject({
      name: COPY.otelName,
      category: INTEGRATION_CATEGORY.AI_ANALYTICS,
      href: PATHS.OTEL(),
      failed: 0,
      beta: false,
    });
    expect(item?.weight).toBeGreaterThan(PLUGIN_CATALOG.claude_code.weight);
    expect(item?.weight).toBeLessThan(PLUGIN_CATALOG['gh-copilot'].weight);
  });

  it('shows the OTel card even before any OTel data has loaded', () => {
    expect(find(OTEL_INTEGRATION_KEY)).toMatchObject({
      connections: 0,
      otel: { active: 0, restartRequired: 0, recoveryRequired: 0 },
    });
  });

  it('counts active OTel connections and summarizes their credentials', () => {
    const items = build({
      otelConnections: [otel(), otel({}, [], OTEL_CONNECTION_STATUS.REVOKED), otel({ recoveryRequired: true })],
    });
    expect(find(OTEL_INTEGRATION_KEY, items)).toMatchObject({
      connections: 2,
      otel: { active: 1, restartRequired: 0, recoveryRequired: 1 },
    });
  });

  it('has no link on a plugin integration', () => {
    expect(find('github')?.href).toBeUndefined();
  });
});
