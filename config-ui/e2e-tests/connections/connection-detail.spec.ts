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
import {
  adminApi,
  createBlueprint,
  createGithubConnection,
  deleteBlueprintsByPrefix,
  deleteConnectionsByPrefix,
  getConnection,
  listScopes,
  putGithubScope,
  uniqueName,
} from '../support/api';
import { DETAIL_COPY } from '../support/app-copy';
import { ConnectionDetailPage, PLUGINS } from '../support/pages/connections';

const E2E_PREFIX = 'e2e-';

let api: APIRequestContext;
let githubIdSeed = Date.now() % 1_000_000;

test.beforeAll(async ({ playwright }) => {
  api = await adminApi(playwright);
});

test.afterAll(async () => {
  await deleteBlueprintsByPrefix(api, E2E_PREFIX);
  await deleteConnectionsByPrefix(api, 'github');
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await loginAsAdmin(context);
});

// A connection with one dummy-token GitHub scope per name; the scopes are written straight to the API, so no remote is needed.
const seedConnection = async (label: string, scopeLabels: string[]) => {
  const { id } = await createGithubConnection(api, uniqueName(label));
  const scopes = [];
  for (const scopeLabel of scopeLabels) {
    const githubId = (githubIdSeed += 1);
    const fullName = `e2e-org/${scopeLabel}-${githubId}`;
    await putGithubScope(api, id, { githubId, fullName });
    scopes.push({ githubId, fullName });
  }
  return { id, scopes };
};

test('bulk deleting two selected scopes removes them from the UI and the API and keeps the third', async ({ page }) => {
  const { id, scopes } = await seedConnection('gh-bulk', ['alpha', 'beta', 'gamma']);
  const [first, second, third] = scopes.map((scope) => scope.fullName);

  const detail = new ConnectionDetailPage(page, PLUGINS.github);
  await detail.open(id);
  await expect(detail.scopeRow(third)).toBeVisible();
  await expect(detail.bulkDeleteButton).toBeDisabled();
  await detail.selectScope(first);
  await detail.selectScope(second);
  await expect(detail.bulkDeleteButton).toBeEnabled();
  await detail.deleteSelectedScopes(2);

  await expect(detail.bulkSucceeded(2)).toBeVisible();
  await detail.closeBulkResult();
  await expect(detail.scopeRow(first)).toHaveCount(0);
  await expect(detail.scopeRow(second)).toHaveCount(0);
  await expect(detail.scopeRow(third)).toBeVisible();

  const { count, scopes: remaining } = await listScopes(api, 'github', id);
  expect(count).toBe(1);
  expect(remaining[0].scope.fullName).toBe(third);
});

test('deleting one scope names it in the confirmation and removes it from the API', async ({ page }) => {
  const { id, scopes } = await seedConnection('gh-single', ['alpha', 'beta']);
  const [target, kept] = scopes.map((scope) => scope.fullName);

  const detail = new ConnectionDetailPage(page, PLUGINS.github);
  await detail.open(id);
  await detail.removeScope(target);
  await expect(detail.toast(DETAIL_COPY.toast.scopeDeleted)).toBeVisible();
  await expect(detail.scopeRow(target)).toHaveCount(0);
  await expect(detail.scopeRow(kept)).toBeVisible();

  const { scopes: remaining } = await listScopes(api, 'github', id);
  expect(remaining.map((item) => item.scope.fullName)).toEqual([kept]);
});

test('a connection used by a blueprint cannot be deleted and the dialog lists the blueprint', async ({ page }) => {
  const { id, scopes } = await seedConnection('gh-conflict', ['alpha']);
  const blueprintName = uniqueName('bp-conflict');
  await createBlueprint(api, blueprintName, {
    connections: [{ pluginName: 'github', connectionId: id, scopes: [{ scopeId: String(scopes[0].githubId) }] }],
  });

  const detail = new ConnectionDetailPage(page, PLUGINS.github);
  await detail.open(id);
  await detail.deleteConnection();

  await expect(detail.conflictDialog).toBeVisible();
  await expect(detail.conflictNames()).toHaveText([blueprintName]);
  expect(await getConnection(api, 'github', id)).toBeDefined();
});
