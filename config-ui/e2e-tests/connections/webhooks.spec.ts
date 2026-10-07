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
import { adminApi, deleteWebhooksByPrefix, listWebhooks, uniqueName } from '../support/api';
import { ConnectionsPage, PLUGINS } from '../support/pages/connections';
import { WebhooksDialog } from '../support/pages/webhooks';

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await adminApi(playwright);
});

test.afterAll(async () => {
  await deleteWebhooksByPrefix(api);
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await loginAsAdmin(context);
});

const openWebhooks = async (connections: ConnectionsPage, webhooks: WebhooksDialog) => {
  await connections.open();
  await connections.openCard(PLUGINS.webhook.name);
  await expect(webhooks.manage).toBeVisible();
};

test('create, rename, renew the key of and delete a webhook from the connections page', async ({ page }) => {
  const name = uniqueName('webhook-conn');
  const renamed = `${name}-renamed`;
  const connections = new ConnectionsPage(page);
  const webhooks = new WebhooksDialog(page);

  await openWebhooks(connections, webhooks);
  await webhooks.create(name);
  await expect(webhooks.createdNotice).toBeVisible();
  const created = (await listWebhooks(api)).find((webhook) => webhook.name === name);
  expect(created, 'webhook exists in the API').toBeDefined();
  const { id } = created as { id: number };
  await expect(webhooks.createDialog).toContainText(`/api/rest/plugins/webhook/connections/${id}/issues`);
  await webhooks.finishCreate();
  await expect(webhooks.row(name)).toBeVisible();

  await webhooks.rename(name, renamed);
  await expect(webhooks.row(renamed)).toBeVisible();
  await expect.poll(async () => (await listWebhooks(api)).find((webhook) => webhook.id === id)?.name).toBe(renamed);

  await webhooks.openDetail(renamed);
  await expect(webhooks.detailDialog).toContainText(`/api/rest/plugins/webhook/connections/${id}/deployments`);
  expect(await webhooks.renewKey(renamed)).toBe(200);
  await expect(webhooks.detailKeyNotice).toBeVisible();
  await webhooks.closeDetail();

  expect(await webhooks.remove(renamed, id)).toBe(200);
  await expect(webhooks.row(renamed)).toHaveCount(0);
  expect((await listWebhooks(api)).find((webhook) => webhook.id === id)).toBeUndefined();
});
