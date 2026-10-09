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
import { DUMMY_TOKEN, adminApi, createConnection, deleteConnectionsByPrefix, uniqueName } from '../support/api';
import { ConnectionsPage, PLUGINS } from '../support/pages/connections';

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await adminApi(playwright);
});

test.afterAll(async () => {
  await deleteConnectionsByPrefix(api, PLUGINS.azureDevops.key);
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await loginAsAdmin(context);
});

test('the deprecation notice shows only with a connection on the deprecated plugin and stays closed after a reload', async ({
  page,
}) => {
  const connections = new ConnectionsPage(page);
  await connections.open();
  await expect(connections.heading).toBeVisible();
  await expect(connections.card(PLUGINS.azureDevops.name)).toBeVisible();
  await expect(connections.deprecationNotice).toBeHidden();

  await createConnection(api, PLUGINS.azureDevops.key, {
    name: uniqueName('az-deprecation'),
    endpoint: 'https://dev.azure.com/',
    token: DUMMY_TOKEN,
    rateLimitPerHour: 1000,
  });
  await connections.reload();
  await expect(connections.deprecationNotice).toBeVisible();

  await connections.closeDeprecationNotice();
  await expect(connections.deprecationNotice).toBeHidden();

  await connections.reload();
  await expect(connections.heading).toBeVisible();
  await expect(connections.card(PLUGINS.azureDevops.name)).toBeVisible();
  await expect(connections.deprecationNotice).toBeHidden();
});
