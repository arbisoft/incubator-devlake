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
import {
  adminApi,
  createGithubConnection,
  deleteConnectionsByPrefix,
  findConnectionByName,
  getConnection,
  uniqueName,
} from '../support/api';
import { ConnectionDetailPage, ConnectionsPage, PLUGINS } from '../support/pages/connections';

const GITHUB_TOKEN = process.env.E2E_GITHUB_TOKEN;

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await adminApi(playwright);
});

test.afterAll(async () => {
  await deleteConnectionsByPrefix(api, 'github');
  await deleteConnectionsByPrefix(api, 'claude_code');
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await loginAsAdmin(context);
});

test.describe('GitHub connection lifecycle through the UI', () => {
  test.skip(!GITHUB_TOKEN, 'E2E_GITHUB_TOKEN is not set');

  test('create, test, save, and edit the name of a connection', async ({ page, browserErrors }) => {
    const name = uniqueName('gh-conn');
    const renamed = `${name}-renamed`;

    const connections = new ConnectionsPage(page);
    const detail = new ConnectionDetailPage(page, PLUGINS.github);
    const form = await connections.openCreateForm(PLUGINS.github);
    await form.fillName(name);
    await form.fillToken(GITHUB_TOKEN as string);
    await form.clickNameField();
    await expect(form.validFrom).toBeVisible();

    await form.test();
    await expect(connections.toast('Test Connection Successfully.')).toBeVisible();

    await form.save();
    await expect(page).toHaveURL(detail.urlPattern);
    const id = detail.idFromUrl();

    const saved = await getConnection(api, 'github', id);
    expect(saved).toMatchObject({
      id,
      name,
      endpoint: 'https://api.github.com/',
      authMethod: 'AccessToken',
    });
    // The API returns the token masked, never in clear text.
    expect(typeof saved?.token).toBe('string');
    expect(saved?.token).not.toBe(GITHUB_TOKEN);
    expect(saved?.token).toContain('*');
    await expect(detail.nameLink(name)).toBeVisible();

    // Edit the name from the connection list; the stored token must keep working.
    await connections.open();
    await connections.openCard(PLUGINS.github.name);
    // The edit form refetches the saved connection and would overwrite input typed before that finishes.
    const editForm = await connections.openEditForm(PLUGINS.github, id, name);
    await expect(editForm.validFrom).toBeVisible();
    await editForm.fillName(renamed);
    await editForm.save();
    await expect(connections.toast('Update Connection Successful.')).toBeVisible();

    await connections.reload();
    expect((await getConnection(api, 'github', id))?.name).toBe(renamed);
    await connections.openCard(PLUGINS.github.name);
    await expect(connections.connectionRow(PLUGINS.github, renamed)).toBeVisible();
    const testRes = await api.post(`/plugins/github/connections/${id}/test`);
    expect(testRes.status()).toBe(200);
    expect((await testRes.json()).success).toBe(true);
  });
});

test('deleting a connection from its page removes it from the UI and the API', async ({ page }) => {
  const name = uniqueName('gh-delete');
  const { id } = await createGithubConnection(api, name);

  const detail = new ConnectionDetailPage(page, PLUGINS.github);
  const connections = new ConnectionsPage(page);
  await detail.open(id);
  await detail.deleteConnection();
  await expect(page).toHaveURL(connections.urlPattern);
  expect(await getConnection(api, 'github', id)).toBeUndefined();
  await connections.reload();
  await connections.openCard(PLUGINS.github.name);
  await expect(connections.connectionRow(PLUGINS.github, name)).toHaveCount(0);
});

test('deleting a connection from its page logs no render error', async ({ page, browserErrors }) => {
  const { id } = await createGithubConnection(api, uniqueName('gh-delete-err'));

  const detail = new ConnectionDetailPage(page, PLUGINS.github);
  await detail.open(id);
  await detail.deleteConnection();
  await expect(page).toHaveURL(new ConnectionsPage(page).urlPattern);
  expect(await getConnection(api, 'github', id)).toBeUndefined();
  expect(browserErrors).toEqual([]);
});

test('claude_code connection keeps its custom headers in the saved payload', async ({ page }) => {
  const name = uniqueName('cc-headers');
  const headers = [
    { key: 'Ocp-Apim-Subscription-Key', value: 'e2e-header-secret-aaaa1111' },
    { key: 'X-E2E-Trace', value: 'e2e-header-secret-bbbb2222' },
  ];

  const form = await new ConnectionsPage(page).openCreateForm(PLUGINS.claudeCode);
  await form.fillName(name);
  await form.fillOrganization('org_e2e_headers');
  for (const [index, header] of headers.entries()) {
    await form.addHeader(index, header.key, header.value);
  }
  // Custom headers replace the API key, and Save does not require a passing Test Connection.
  await form.save();
  await expect(page).toHaveURL(new ConnectionDetailPage(page, PLUGINS.claudeCode).urlPattern);

  const saved = await findConnectionByName(api, 'claude_code', name);
  expect(saved).toMatchObject({ name, organization: 'org_e2e_headers', endpoint: 'https://api.anthropic.com' });
  expect(saved?.customHeaders?.map((h) => h.key)).toEqual(headers.map((h) => h.key));
  // The API masks everything except the first and last two characters of each value.
  saved?.customHeaders?.forEach((h, i) => {
    const original = headers[i].value;
    expect(h.value).toBe(`${original.slice(0, 2)}${'*'.repeat(original.length - 4)}${original.slice(-2)}`);
  });
});

test('a rejected remote credential shows an error and does not sign the user out', async ({ page }) => {
  const connections = new ConnectionsPage(page);
  const form = await connections.openCreateForm(PLUGINS.github);
  const name = uniqueName('gh-bad-token');
  await form.fillName(name);
  await form.fillToken('ghp_e2eInvalidTokenValue000000000000000000');

  expect(await form.testAndGetStatus()).toBe(400);

  await expect(connections.toast(/error when testing connection/i)).toBeVisible();
  await expect(form.dialog).toBeVisible();
  await expect(page).toHaveURL(connections.urlPattern);
  const userinfo = await page.request.get('/api/auth/userinfo');
  expect((await userinfo.json()).authenticated).toBe(true);
  await connections.reload();
  await expect(page).toHaveURL(connections.urlPattern);
  await expect(connections.heading).toBeVisible();
  expect(await findConnectionByName(api, 'github', name)).toBeUndefined();
});
