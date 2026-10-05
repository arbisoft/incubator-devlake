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
import { adminApi, createGithubConnection, deleteConnection, listScopes, uniqueName } from '../support/api';
import { iconButton, modalByTitle, tableRow, toast } from '../support/selectors';

const GITHUB_TOKEN = process.env.E2E_GITHUB_TOKEN;
const GITHUB_REPO = process.env.E2E_GITHUB_REPO;

test.describe.serial('GitHub data scope and scope config on a connection', () => {
  test.skip(!GITHUB_TOKEN || !GITHUB_REPO, 'E2E_GITHUB_TOKEN and E2E_GITHUB_REPO are not set');

  let api: APIRequestContext;
  let connectionId: number;
  const repo = GITHUB_REPO as string;
  const scopeConfigName = uniqueName('scope-config');

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    connectionId = (await createGithubConnection(api, uniqueName('gh-scope'), GITHUB_TOKEN)).id;
  });

  test.afterAll(async () => {
    if (connectionId) {
      await deleteConnection(api, 'github', connectionId);
    }
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('add a data scope through the remote picker', async ({ page, browserErrors }) => {
    await page.goto(`/connections/github/${connectionId}`);
    await page.getByRole('button', { name: 'Add Data Scope' }).click();
    const dialog = modalByTitle(page, 'Add Data Scope');
    await dialog.getByPlaceholder('Search').fill(repo.split('/')[1]);
    await dialog.getByText(repo, { exact: true }).click();
    await expect(dialog.locator('.ant-tag').filter({ hasText: repo })).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page, 'Add data scope successful.')).toBeVisible();

    await expect(tableRow(page, repo)).toBeVisible();
    const { count, scopes } = await listScopes(api, 'github', connectionId);
    expect(count).toBe(1);
    expect(scopes[0].scope.fullName).toBe(repo);
    expect(scopes[0].scope.connectionId).toBe(connectionId);
    await page.reload();
    await expect(tableRow(page, repo)).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test('create a scope config from the UI and associate it with the scope', async ({ page }) => {
    await page.goto(`/connections/github/${connectionId}`);
    await iconButton(tableRow(page, repo), 'link').click();
    const select = modalByTitle(page, 'Associate Scope Config');
    await select.getByRole('button', { name: 'Add New Scope Config' }).click();
    const form = modalByTitle(page, 'Add Scope Config');
    await form.getByPlaceholder('My Scope Config 1').fill(scopeConfigName);
    await form.getByRole('button', { name: 'Next' }).click();
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(tableRow(select, scopeConfigName)).toBeVisible();
    await select.getByRole('button', { name: 'Save' }).click();
    await expect(tableRow(page, repo).getByText(scopeConfigName)).toBeVisible();

    const configsRes = await api.get(`/plugins/github/connections/${connectionId}/scope-configs`);
    const configs: { id: number; name: string; entities: string[] }[] = await configsRes.json();
    const created = configs.find((c) => c.name === scopeConfigName);
    expect(created).toBeDefined();
    expect(created?.entities).toEqual(['CODE', 'TICKET', 'CODEREVIEW', 'CROSS', 'CICD']);

    const { scopes } = await listScopes(api, 'github', connectionId);
    expect(scopes[0].scopeConfig?.id).toBe(created?.id);
    expect(scopes[0].scopeConfig?.name).toBe(scopeConfigName);
    await page.reload();
    await expect(tableRow(page, repo).getByText(scopeConfigName)).toBeVisible();
  });

  test('remove the data scope from the UI', async ({ page }) => {
    await page.goto(`/connections/github/${connectionId}`);
    await iconButton(tableRow(page, repo), 'delete').click();
    await modalByTitle(page, 'Would you like to delete the selected Data Scope?')
      .getByRole('button', { name: 'Confirm' })
      .click();
    await expect(toast(page, 'Delete Data Scope successful.')).toBeVisible();
    await expect(tableRow(page, repo)).toHaveCount(0);

    const { count } = await listScopes(api, 'github', connectionId);
    expect(count).toBe(0);
  });
});
