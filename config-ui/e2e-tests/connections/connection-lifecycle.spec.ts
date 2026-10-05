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
import { APIRequestContext, Page } from '@playwright/test';

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
import { catalogCard, modalByTitle, tableRow, toast } from '../support/selectors';

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

const openCreateForm = async (page: Page, pluginName: string) => {
  await page.goto('/connections');
  await catalogCard(page, pluginName).click();
  const dialog = modalByTitle(page, `Manage Connections: ${pluginName}`);
  await dialog.getByRole('button', { name: 'Create a New Connection' }).click();
  return modalByTitle(page, `Manage Connections: ${pluginName}`);
};

test.describe('GitHub connection lifecycle through the UI', () => {
  test.skip(!GITHUB_TOKEN, 'E2E_GITHUB_TOKEN is not set');

  test('create, test, save, and edit the name of a connection', async ({ page, browserErrors }) => {
    const name = uniqueName('gh-conn');
    const renamed = `${name}-renamed`;

    const form = await openCreateForm(page, 'GitHub');
    await form.getByPlaceholder('Your Connection Name').fill(name);
    await form.getByPlaceholder('Token').fill(GITHUB_TOKEN as string);
    await form.getByPlaceholder('Your Connection Name').click();
    await expect(form.getByText(/Valid From:/)).toBeVisible();

    await form.getByRole('button', { name: 'Test Connection' }).click();
    await expect(toast(page, 'Test Connection Successfully.')).toBeVisible();

    await form.getByRole('button', { name: 'Save Connection' }).click();
    await expect(page).toHaveURL(/\/connections\/github\/\d+$/);
    const id = Number(new URL(page.url()).pathname.split('/').pop());

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
    await expect(page.getByRole('link', { name })).toBeVisible();

    // Edit the name from the connection list; the stored token must keep working.
    await page.goto('/connections');
    await catalogCard(page, 'GitHub').click();
    // The edit form refetches the saved connection and would overwrite input typed before that finishes.
    const detailLoaded = page.waitForResponse(
      (res) => res.url().endsWith(`/plugins/github/connections/${id}`) && res.request().method() === 'GET',
    );
    await tableRow(modalByTitle(page, 'Manage Connections: GitHub'), name)
      .getByRole('button', { name: 'Edit' })
      .click();
    await detailLoaded;
    const editForm = modalByTitle(page, 'Manage Connections: GitHub').last();
    await expect(editForm.getByText(/Valid From:/)).toBeVisible();
    await editForm.getByPlaceholder('Your Connection Name').fill(renamed);
    await editForm.getByRole('button', { name: 'Save Connection' }).click();
    await expect(toast(page, 'Update Connection Successful.')).toBeVisible();

    await page.reload();
    expect((await getConnection(api, 'github', id))?.name).toBe(renamed);
    await catalogCard(page, 'GitHub').click();
    await expect(tableRow(modalByTitle(page, 'Manage Connections: GitHub'), renamed)).toBeVisible();
    const testRes = await api.post(`/plugins/github/connections/${id}/test`);
    expect(testRes.status()).toBe(200);
    expect((await testRes.json()).success).toBe(true);
  });
});

test('deleting a connection from its page removes it from the UI and the API', async ({ page }) => {
  const name = uniqueName('gh-delete');
  const { id } = await createGithubConnection(api, name);

  await page.goto(`/connections/github/${id}`);
  await page.getByRole('button', { name: 'Delete Connection' }).click();
  await modalByTitle(page, 'Would you like to delete this Data Connection?')
    .getByRole('button', { name: 'Confirm' })
    .click();
  await expect(page).toHaveURL(/\/connections$/);
  expect(await getConnection(api, 'github', id)).toBeUndefined();
  await page.reload();
  await catalogCard(page, 'GitHub').click();
  await expect(tableRow(modalByTitle(page, 'Manage Connections: GitHub'), name)).toHaveCount(0);
});

test('deleting a connection from its page logs no render error', async ({ page, browserErrors }) => {
  test.fail(true, 'connection.tsx destructures the connection after the store drops it on delete');
  const { id } = await createGithubConnection(api, uniqueName('gh-delete-err'));

  await page.goto(`/connections/github/${id}`);
  await page.getByRole('button', { name: 'Delete Connection' }).click();
  await modalByTitle(page, 'Would you like to delete this Data Connection?')
    .getByRole('button', { name: 'Confirm' })
    .click();
  await expect(page).toHaveURL(/\/connections$/);
  expect(await getConnection(api, 'github', id)).toBeUndefined();
  expect(browserErrors).toEqual([]);
});

test('claude_code connection keeps its custom headers in the saved payload', async ({ page }) => {
  const name = uniqueName('cc-headers');
  const headers = [
    { key: 'Ocp-Apim-Subscription-Key', value: 'e2e-header-secret-aaaa1111' },
    { key: 'X-E2E-Trace', value: 'e2e-header-secret-bbbb2222' },
  ];

  const form = await openCreateForm(page, 'Claude Code');
  await form.getByPlaceholder('Your Connection Name').fill(name);
  await form.getByPlaceholder('e.g. org_123456789').fill('org_e2e_headers');
  for (const [index, header] of headers.entries()) {
    await form.getByRole('button', { name: '+ Add Header' }).click();
    await form.getByPlaceholder('Header name').nth(index).fill(header.key);
    await form.getByPlaceholder('Header value').nth(index).fill(header.value);
  }
  // Custom headers replace the API key, and Save does not require a passing Test Connection.
  await form.getByRole('button', { name: 'Save Connection' }).click();
  await expect(page).toHaveURL(/\/connections\/claude_code\/\d+$/);

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
  const form = await openCreateForm(page, 'GitHub');
  await form.getByPlaceholder('Your Connection Name').fill(uniqueName('gh-bad-token'));
  await form.getByPlaceholder('Token').fill('ghp_e2eInvalidTokenValue000000000000000000');

  const testResponse = page.waitForResponse(
    (res) => res.url().endsWith('/plugins/github/test') && res.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Test Connection' }).click();
  expect((await testResponse).status()).toBe(400);

  await expect(toast(page, /error when testing connection/i)).toBeVisible();
  await expect(form).toBeVisible();
  await expect(page).toHaveURL(/\/connections$/);
  const userinfo = await page.request.get('/api/auth/userinfo');
  expect((await userinfo.json()).authenticated).toBe(true);
  await page.reload();
  await expect(page).toHaveURL(/\/connections$/);
  await expect(page.getByRole('heading', { name: 'Connections', level: 1 })).toBeVisible();
});
