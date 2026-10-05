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
import { APIRequestContext } from '@playwright/test';

import { test, expect } from '../fixtures';
import { loginAsAdmin } from '../auth-helpers';
import { DUMMY_TOKEN, adminApi, createConnection, deleteConnection, listConnections, uniqueName } from '../support/api';
import { catalogCard, catalogCards, modalByTitle, tableRow } from '../support/selectors';

// UI-only upstream plugins must stay hidden until their backend is synced.
const HIDDEN_UPSTREAM_PLUGINS = [
  'Rootly',
  'Tempo',
  'Linear',
  'ClickUp',
  'incident.io',
  'Kiro',
  'Grafana IRM',
  'YouTrack',
];

const CORE_PLUGINS = ['GitHub', 'GitLab', 'Jira', 'Jenkins', 'Bitbucket Cloud', 'Claude Code', 'Webhook'];

let api: APIRequestContext;
const created: number[] = [];

test.beforeAll(async ({ playwright }) => {
  api = await adminApi(playwright);
});

test.afterAll(async () => {
  for (const id of created) {
    await deleteConnection(api, 'claude_code', id);
  }
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await loginAsAdmin(context);
});

test('the catalog lists the supported plugins, the OTel card, and hides upstream-only plugins', async ({
  page,
  browserErrors,
}) => {
  await page.goto('/connections');
  await expect(page.getByRole('heading', { name: 'Connections', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data Connections', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Webhooks', exact: true })).toBeVisible();

  for (const name of [...CORE_PLUGINS, 'Claude Code OTel']) {
    await expect(catalogCard(page, name)).toBeVisible();
  }

  const names = (await catalogCards(page).allInnerTexts()).map((n) => n.trim().toLowerCase());
  for (const hidden of HIDDEN_UPSTREAM_PLUGINS) {
    expect(names, `${hidden} must not be in the catalog`).not.toContain(hidden.toLowerCase());
  }
  expect(browserErrors).toEqual([]);
});

test('connections created through the API are reflected on the plugin card and its connection list', async ({
  page,
}) => {
  const baseline = (await listConnections(api, 'claude_code')).length;
  const names = [uniqueName('cc-catalog-a'), uniqueName('cc-catalog-b')];
  for (const name of names) {
    const connection = await createConnection(api, 'claude_code', {
      name,
      endpoint: 'https://api.anthropic.com',
      organization: 'org_e2e_catalog',
      token: DUMMY_TOKEN,
      rateLimitPerHour: 1000,
    });
    created.push(connection.id);
  }

  await page.goto('/connections');
  await expect(catalogCard(page, 'Claude Code').locator('.count')).toHaveText(`${baseline + names.length} connections`);

  await catalogCard(page, 'Claude Code').click();
  const list = modalByTitle(page, 'Manage Connections: Claude Code');
  for (const name of names) {
    await expect(tableRow(list, name)).toBeVisible();
  }

  const removed = created.pop() as number;
  await deleteConnection(api, 'claude_code', removed);
  await page.reload();
  await expect(catalogCard(page, 'Claude Code').locator('.count')).toHaveText(
    `${baseline + names.length - 1} connections`,
  );
});
