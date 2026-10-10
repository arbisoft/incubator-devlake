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

import { loginAsAdmin } from '../auth-helpers';
import { test, expect } from '../fixtures';
import { DUMMY_TOKEN, adminApi, createConnection, deleteConnection, listConnections, uniqueName } from '../support/api';
import { CONNECTIONS_COPY, INTEGRATION_CARD_COPY, INTEGRATION_CATEGORY } from '../support/app-copy';
import { ConnectionsPage, PLUGINS } from '../support/pages/connections';

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
  const connections = new ConnectionsPage(page);
  await connections.open();
  await expect(connections.heading).toBeVisible();
  for (const category of Object.values(INTEGRATION_CATEGORY)) {
    await expect(connections.categoryTab(category)).toBeVisible();
  }

  for (const name of [...CORE_PLUGINS, 'Claude Code OTel']) {
    await expect(connections.card(name)).toBeVisible();
  }

  const names = (await connections.cardNames.allInnerTexts()).map((n) => n.trim().toLowerCase());
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

  const connections = new ConnectionsPage(page);
  await connections.open();
  await expect(connections.cardCount(PLUGINS.claudeCode.name)).toHaveText(
    INTEGRATION_CARD_COPY.connected(baseline + names.length),
  );

  await connections.openCard(PLUGINS.claudeCode.name);
  for (const name of names) {
    await expect(connections.connectionRow(PLUGINS.claudeCode, name)).toBeVisible();
  }

  const removed = created.pop() as number;
  await deleteConnection(api, 'claude_code', removed);
  await connections.reload();
  await expect(connections.cardCount(PLUGINS.claudeCode.name)).toHaveText(
    INTEGRATION_CARD_COPY.connected(baseline + names.length - 1),
  );
});

test('the search narrows the catalog, and it is kept in the URL across a reload', async ({ page }) => {
  const connections = new ConnectionsPage(page);
  await connections.open();
  await connections.search('GitHub');
  await expect(connections.card(PLUGINS.github.name)).toBeVisible();
  await expect(connections.card('Jenkins')).toBeHidden();

  await connections.reload();
  await expect(connections.searchBox).toHaveValue('GitHub');
  await expect(connections.card(PLUGINS.github.name)).toBeVisible();
  await expect(connections.card('Jenkins')).toBeHidden();
});

test('a search with no match shows the empty state, and Clear filters brings the catalog back', async ({ page }) => {
  const connections = new ConnectionsPage(page);
  await connections.open();
  await connections.search('e2e-no-such-integration');
  await expect(connections.noResults).toBeVisible();
  await expect(connections.cards).toHaveCount(0);

  await connections.clearFilters();
  await expect(connections.noResults).toBeHidden();
  await expect(connections.card(PLUGINS.github.name)).toBeVisible();
});

test('a category tab shows only its integrations, and it is kept in the URL across a reload', async ({ page }) => {
  const connections = new ConnectionsPage(page);
  await connections.open();
  await connections.selectCategory(INTEGRATION_CATEGORY.CI_CD);
  await expect(connections.card('Jenkins')).toBeVisible();
  await expect(connections.card(PLUGINS.github.name)).toBeHidden();
  expect(connections.queryParams.category).toBe(INTEGRATION_CATEGORY.CI_CD);

  await connections.reload();
  await expect(connections.card('Jenkins')).toBeVisible();
  await expect(connections.card(PLUGINS.github.name)).toBeHidden();
});

test('A to Z orders the cards by name', async ({ page }) => {
  const connections = new ConnectionsPage(page);
  await connections.open();
  await expect(connections.card(PLUGINS.github.name)).toBeVisible();
  await connections.sortBy(CONNECTIONS_COPY.sort.name);
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  await expect
    .poll(async () => {
      const names = await connections.cardNameList();
      return names.length > 1 && names.join() === [...names].sort(byName).join();
    })
    .toBe(true);
});

test('Show connected only keeps the cards that have connections', async ({ page }) => {
  const connection = await createConnection(api, 'claude_code', {
    name: uniqueName('cc-connected-only'),
    endpoint: 'https://api.anthropic.com',
    organization: 'org_e2e_connected_only',
    token: DUMMY_TOKEN,
    rateLimitPerHour: 1000,
  });
  created.push(connection.id);

  const connections = new ConnectionsPage(page);
  await connections.open();
  await expect(connections.card(PLUGINS.github.name)).toBeVisible();
  const all = await connections.cards.count();
  await connections.toggleConnectedOnly();
  await expect(connections.card(PLUGINS.claudeCode.name)).toBeVisible();
  await expect
    .poll(async () => {
      const shown = await connections.cards.count();
      return shown < all && shown === (await connections.connectedCards.count());
    })
    .toBe(true);
  expect(connections.queryParams.connected).not.toBeNull();
});

test('a connected card offers Manage only, and Add connection stays in its actions menu', async ({ page }) => {
  const connection = await createConnection(api, 'claude_code', {
    name: uniqueName('cc-card-actions'),
    endpoint: 'https://api.anthropic.com',
    organization: 'org_e2e_card_actions',
    token: DUMMY_TOKEN,
    rateLimitPerHour: 1000,
  });
  created.push(connection.id);

  const connections = new ConnectionsPage(page);
  await connections.open();
  await expect(connections.manageButton(PLUGINS.claudeCode.name)).toBeVisible();
  await expect(connections.addButton(PLUGINS.claudeCode.name)).toHaveCount(0);

  await connections.addConnectionFromCard(PLUGINS.claudeCode.name);
  await expect(connections.manageDialog(PLUGINS.claudeCode)).toBeVisible();
  await expect(connections.connectionNameField(PLUGINS.claudeCode)).toBeVisible();
});
