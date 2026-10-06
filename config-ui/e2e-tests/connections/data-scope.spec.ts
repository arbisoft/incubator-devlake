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
import { ConnectionDetailPage, PLUGINS } from '../support/pages/connections';

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
    const detail = new ConnectionDetailPage(page, PLUGINS.github);
    await detail.open(connectionId);
    await detail.openAddScope();
    await detail.searchRemoteScope(repo.split('/')[1]);
    await detail.pickRemoteScope(repo);
    await expect(detail.pickedScopeTag(repo)).toBeVisible();
    await detail.saveAddScope();
    await expect(detail.toast('Add data scope successful.')).toBeVisible();

    await expect(detail.scopeRow(repo)).toBeVisible();
    const { count, scopes } = await listScopes(api, 'github', connectionId);
    expect(count).toBe(1);
    expect(scopes[0].scope.fullName).toBe(repo);
    expect(scopes[0].scope.connectionId).toBe(connectionId);
    await detail.reload();
    await expect(detail.scopeRow(repo)).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test('create a scope config from the UI and associate it with the scope', async ({ page }) => {
    const detail = new ConnectionDetailPage(page, PLUGINS.github);
    await detail.open(connectionId);
    await detail.openAssociateScopeConfig(repo);
    await detail.createScopeConfig(scopeConfigName);
    await expect(detail.associateScopeConfigRow(scopeConfigName)).toBeVisible();
    await detail.saveAssociateScopeConfig();
    await expect(detail.scopeConfigCell(repo, scopeConfigName)).toBeVisible();

    const configsRes = await api.get(`/plugins/github/connections/${connectionId}/scope-configs`);
    const configs: { id: number; name: string; entities: string[] }[] = await configsRes.json();
    const created = configs.find((c) => c.name === scopeConfigName);
    expect(created).toBeDefined();
    expect(created?.entities).toEqual(['CODE', 'TICKET', 'CODEREVIEW', 'CROSS', 'CICD']);

    const { scopes } = await listScopes(api, 'github', connectionId);
    expect(scopes[0].scopeConfig?.id).toBe(created?.id);
    expect(scopes[0].scopeConfig?.name).toBe(scopeConfigName);
    await detail.reload();
    await expect(detail.scopeConfigCell(repo, scopeConfigName)).toBeVisible();
  });

  test('remove the data scope from the UI', async ({ page }) => {
    const detail = new ConnectionDetailPage(page, PLUGINS.github);
    await detail.open(connectionId);
    await detail.removeScope(repo);
    await expect(detail.toast('Delete Data Scope successful.')).toBeVisible();
    await expect(detail.scopeRow(repo)).toHaveCount(0);

    const { count } = await listScopes(api, 'github', connectionId);
    expect(count).toBe(0);
  });
});
