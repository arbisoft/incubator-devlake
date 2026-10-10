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
import { CONNECTION_LIST_COPY } from '../support/app-copy';
import { ConnectionsPage, PLUGINS } from '../support/pages/connections';

// A real token passes the test; the dummy one is rejected by GitHub.
const GITHUB_TOKEN = process.env.E2E_GITHUB_TOKEN;
const TOKEN = GITHUB_TOKEN || DUMMY_TOKEN;
const RESULT_TAB = GITHUB_TOKEN ? CONNECTION_LIST_COPY.filters.connected : CONNECTION_LIST_COPY.filters.failed;
const OTHER_TAB = GITHUB_TOKEN ? CONNECTION_LIST_COPY.filters.failed : CONNECTION_LIST_COPY.filters.connected;

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

test('the manage dialog tests its rows and sorts them into the Connected and Failed tabs', async ({ page }) => {
  const name = uniqueName('gh-manage');
  const { id } = await createGithubConnection(api, name, TOKEN);

  const connections = new ConnectionsPage(page);
  const tested = connections.waitForConnectionTest(PLUGINS.github, id);
  await connections.open();
  await connections.openCard(PLUGINS.github.name);
  await tested;

  await connections.selectManageTab(PLUGINS.github, RESULT_TAB);
  await expect(connections.connectionRow(PLUGINS.github, name)).toBeVisible();
  await connections.selectManageTab(PLUGINS.github, OTHER_TAB);
  await expect(connections.connectionRow(PLUGINS.github, name)).toHaveCount(0);
  await connections.selectManageTab(PLUGINS.github, CONNECTION_LIST_COPY.filters.all);
  await expect(connections.connectionRow(PLUGINS.github, name)).toBeVisible();
});

test('a row of the manage dialog shows how many data scopes the connection has', async ({ page }) => {
  const name = uniqueName('gh-manage-count');
  await createGithubConnection(api, name, TOKEN);

  const connections = new ConnectionsPage(page);
  await connections.open();
  await connections.openCard(PLUGINS.github.name);

  await expect(connections.repoCount(PLUGINS.github, name)).toHaveText(/^\d+$/);
});
