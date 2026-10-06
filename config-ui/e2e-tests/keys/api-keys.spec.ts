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
import { adminApi, createApiKey, deleteApiKeysByPrefix, listApiKeys, uniqueName } from '../support/api';
import { API_URL } from '../support/env';
import { ApiKeysPage } from '../support/pages/api-keys';

const DAY_MS = 24 * 60 * 60 * 1000;

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await adminApi(playwright);
});

test.afterAll(async () => {
  await deleteApiKeysByPrefix(api);
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await loginAsAdmin(context);
});

test('an API key created in the UI authenticates REST calls until it is revoked', async ({
  page,
  playwright,
  browserErrors,
}) => {
  const keyName = uniqueName('key');
  const allowedPath = '^/projects$';

  const keys = new ApiKeysPage(page);
  await keys.open();
  await keys.fillNewKeyForm(keyName, '7 days', allowedPath);

  const before = Date.now();
  const apiKey = await keys.generate();

  const shown = keys.generatedKeyDialog;
  await expect(shown).toBeVisible();
  expect((await shown.innerText()).includes(apiKey), 'the one-time key is displayed').toBe(true);
  await keys.closeGeneratedKeyDialog();

  const stored = (await listApiKeys(api)).find((k) => k.name === keyName);
  expect(stored).toMatchObject({ name: keyName, allowedPath });
  expect(Math.abs(new Date(stored?.expiredAt as string).getTime() - (before + 7 * DAY_MS))).toBeLessThan(DAY_MS);
  expect(JSON.stringify(stored)).not.toContain(apiKey);
  await expect(keys.keyRow(keyName)).toBeVisible();

  const bare = await playwright.request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${apiKey}` } });
  const allowed = await bare.get(`${API_URL}/rest/projects`, { params: { pageSize: 1 } });
  expect(allowed.status()).toBe(200);
  expect(await allowed.json()).toHaveProperty('projects');
  const outOfScope = await bare.get(`${API_URL}/rest/plugins/github/connections`);
  expect(outOfScope.status()).toBe(403);

  await keys.revokeKey(keyName);
  await expect(keys.keyRow(keyName)).toHaveCount(0);
  expect((await listApiKeys(api)).find((k) => k.name === keyName)).toBeUndefined();

  const revoked = await bare.get(`${API_URL}/rest/projects`, { params: { pageSize: 1 } });
  expect(revoked.status()).toBe(403);
  expect((await revoked.json()).message).toBe('api key is invalid');
  await bare.dispose();
  expect(browserErrors).toEqual([]);
});

test('keyword search and expiration sort survive a reload', async ({ page, browserErrors }) => {
  const prefix = uniqueName('sortkey');
  const expiries = { soon: 10, middle: 20, late: 30 };
  const names = Object.fromEntries(Object.keys(expiries).map((label) => [label, `${prefix}-${label}`]));
  for (const [label, days] of Object.entries(expiries)) {
    await createApiKey(api, names[label], new Date(Date.now() + days * DAY_MS).toISOString());
  }
  const ascending = [names.soon, names.middle, names.late];

  const keys = new ApiKeysPage(page);
  await keys.open();
  await keys.search(prefix);
  await expect.poll(async () => (await keys.keyNames()).length).toBe(ascending.length);
  expect(keys.urlParams.get('keyword')).toBe(prefix);

  await keys.sortByExpiration();
  await expect.poll(() => keys.urlParams.get('sortOrder')).toBe('asc');
  expect(keys.urlParams.get('sortBy')).toBe('expiredAt');
  await expect.poll(() => keys.keyNames()).toEqual(ascending);

  await keys.reload();
  expect(keys.urlParams.get('keyword')).toBe(prefix);
  expect(keys.urlParams.get('sortBy')).toBe('expiredAt');
  await expect.poll(() => keys.keyNames()).toEqual(ascending);

  await keys.sortByExpiration();
  await expect.poll(() => keys.urlParams.get('sortOrder')).toBe('desc');
  await expect.poll(() => keys.keyNames()).toEqual([...ascending].reverse());
  expect(browserErrors).toEqual([]);
});
