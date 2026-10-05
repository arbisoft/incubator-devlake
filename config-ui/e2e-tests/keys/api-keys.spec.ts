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
import { adminApi, deleteApiKeysByPrefix, listApiKeys, uniqueName } from '../support/api';
import { API_URL } from '../support/env';
import { modalByTitle, selectBox, selectOption, tableRow, textInputs } from '../support/selectors';

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

  await page.goto('/keys');
  await page.getByRole('button', { name: 'New API Key' }).click();
  const form = modalByTitle(page, 'Generate a New API Key');
  await form.getByPlaceholder('My API Key').fill(keyName);
  await selectBox(form).click();
  await selectOption(page, '7 days').click();
  await textInputs(form).nth(1).fill(allowedPath);

  const created = page.waitForResponse((res) => res.url().endsWith('/api-keys') && res.request().method() === 'POST');
  const before = Date.now();
  await form.getByRole('button', { name: 'Generate' }).click();
  const apiKey = ((await (await created).json()) as { apiKey: string }).apiKey;

  const shown = modalByTitle(page, 'Your API key has been generated!');
  await expect(shown).toBeVisible();
  expect((await shown.innerText()).includes(apiKey), 'the one-time key is displayed').toBe(true);
  await shown.getByRole('button', { name: 'Close' }).click();

  const stored = (await listApiKeys(api)).find((k) => k.name === keyName);
  expect(stored).toMatchObject({ name: keyName, allowedPath });
  expect(Math.abs(new Date(stored?.expiredAt as string).getTime() - (before + 7 * DAY_MS))).toBeLessThan(DAY_MS);
  expect(JSON.stringify(stored)).not.toContain(apiKey);
  await expect(tableRow(page, keyName)).toBeVisible();

  const bare = await playwright.request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${apiKey}` } });
  const allowed = await bare.get(`${API_URL}/rest/projects`, { params: { pageSize: 1 } });
  expect(allowed.status()).toBe(200);
  expect(await allowed.json()).toHaveProperty('projects');
  const outOfScope = await bare.get(`${API_URL}/rest/plugins/github/connections`);
  expect(outOfScope.status()).toBe(403);

  await tableRow(page, keyName).getByRole('button', { name: 'Revoke' }).click();
  await modalByTitle(page, 'Are you sure you want to revoke this API key?')
    .getByRole('button', { name: 'Confirm' })
    .click();
  await expect(tableRow(page, keyName)).toHaveCount(0);
  expect((await listApiKeys(api)).find((k) => k.name === keyName)).toBeUndefined();

  const revoked = await bare.get(`${API_URL}/rest/projects`, { params: { pageSize: 1 } });
  expect(revoked.status()).toBe(403);
  expect((await revoked.json()).message).toBe('api key is invalid');
  await bare.dispose();
  expect(browserErrors).toEqual([]);
});
