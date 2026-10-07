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
import { DUMMY_TOKEN, adminApi, createGithubConnection, deleteConnectionsByPrefix, uniqueName } from '../support/api';
import { ConnectionsPage, PLUGINS } from '../support/pages/connections';

// A real token passes the test; the dummy one is rejected by GitHub.
const GITHUB_TOKEN = process.env.E2E_GITHUB_TOKEN;
const TOKEN = GITHUB_TOKEN || DUMMY_TOKEN;
const EXPECTED_STATUS = GITHUB_TOKEN ? 'online' : 'offline';

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await adminApi(playwright);
});

test.afterAll(async () => {
  await deleteConnectionsByPrefix(api, PLUGINS.github.key);
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await loginAsAdmin(context);
});

test('a connection is tested when its card comes into view, and the result shows on the card', async ({ page }) => {
  const { id } = await createGithubConnection(api, uniqueName('gh-health'), TOKEN);

  const connections = new ConnectionsPage(page);
  const tested = connections.waitForConnectionTest(PLUGINS.github, id);
  await connections.open();
  await tested;

  await expect.poll(async () => (await connections.storedHealth(PLUGINS.github, id))?.status).toBe(EXPECTED_STATUS);
  const stored = await connections.storedHealth(PLUGINS.github, id);
  expect(stored?.testedAt).toBeGreaterThan(0);

  if (GITHUB_TOKEN) {
    await expect(connections.cardCount(PLUGINS.github.name)).toBeVisible();
  } else {
    expect(stored?.reason).toBeDefined();
    await expect(connections.cardFailedCount(PLUGINS.github.name)).toBeVisible();
  }
});

test('a reload within the validity window sends no connection test', async ({ page }) => {
  const { id } = await createGithubConnection(api, uniqueName('gh-health-reload'), TOKEN);

  const connections = new ConnectionsPage(page);
  const firstTest = connections.waitForConnectionTest(PLUGINS.github, id);
  await connections.open();
  await firstTest;
  await expect.poll(async () => (await connections.storedHealth(PLUGINS.github, id))?.status).toBe(EXPECTED_STATUS);
  await connections.waitUntilSettled();

  const tests = connections.trackConnectionTests();
  await connections.reload();
  await expect(connections.cardCount(PLUGINS.github.name)).toBeVisible();
  await connections.waitUntilSettled();
  expect(tests.count()).toBe(0);
  expect((await connections.storedHealth(PLUGINS.github, id))?.status).toBe(EXPECTED_STATUS);
});

test('a result older than the validity window is tested again on the next visit', async ({ page }) => {
  const { id } = await createGithubConnection(api, uniqueName('gh-health-expiry'), TOKEN);

  const connections = new ConnectionsPage(page);
  const firstTest = connections.waitForConnectionTest(PLUGINS.github, id);
  await connections.open();
  await firstTest;
  await expect.poll(async () => (await connections.storedHealth(PLUGINS.github, id))?.status).toBe(EXPECTED_STATUS);
  const before = (await connections.storedHealth(PLUGINS.github, id))?.testedAt ?? 0;
  expect(before).toBeGreaterThan(0);
  await connections.waitUntilSettled();

  await connections.expireStoredHealth();
  const secondTest = connections.waitForConnectionTest(PLUGINS.github, id);
  await connections.reload();
  await secondTest;
  await expect
    .poll(async () => (await connections.storedHealth(PLUGINS.github, id))?.testedAt ?? 0)
    .toBeGreaterThan(before);
});
