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
  deleteBlueprintsByPrefix,
  listBlueprintsByKeyword,
  uniqueName,
} from '../support/api';
import { BLUEPRINT_HOME_COPY, BLUEPRINT_STATUS_FILTER } from '../support/app-copy';
import { BlueprintPage } from '../support/pages/blueprints';

test.describe.serial('Blueprints list search, status filter and create', () => {
  let api: APIRequestContext;
  const prefix = uniqueName('bplist');
  const names = { first: `${prefix}-first`, second: `${prefix}-second`, off: `${prefix}-off` };

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    await createBlueprint(api, names.first);
    await createBlueprint(api, names.second);
    await createBlueprint(api, names.off, { enable: false });
  });

  test.afterAll(async () => {
    await deleteBlueprintsByPrefix(api, prefix);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('search narrows the list and survives a reload', async ({ page, browserErrors }) => {
    const blueprints = new BlueprintPage(page);
    await blueprints.open();
    await blueprints.search(prefix);
    await expect.poll(() => blueprints.urlParams.get('keyword')).toBe(prefix);
    await expect.poll(async () => (await blueprints.blueprintNames()).sort()).toEqual(Object.values(names).sort());

    await blueprints.search(names.second);
    await expect.poll(() => blueprints.blueprintNames()).toEqual([names.second]);

    await blueprints.reload();
    await expect(blueprints.blueprintRow(names.second)).toBeVisible();
    expect(blueprints.urlParams.get('keyword')).toBe(names.second);
    expect(browserErrors).toEqual([]);
  });

  test('a search with no match shows the empty state and keeps the keyword', async ({ page }) => {
    const blueprints = new BlueprintPage(page);
    await blueprints.open();
    await blueprints.search(`${prefix}-no-such-blueprint`);
    await expect(blueprints.noResults()).toBeVisible();
    await blueprints.reload();
    await expect(blueprints.noResults()).toBeVisible();
  });

  test('the status filter keeps only enabled or only disabled blueprints', async ({ page }) => {
    const blueprints = new BlueprintPage(page);
    await blueprints.openWithQuery(`keyword=${prefix}`);
    await expect.poll(async () => (await blueprints.blueprintNames()).length).toBe(3);

    await blueprints.filterByStatus(BLUEPRINT_HOME_COPY.statusFilter[BLUEPRINT_STATUS_FILTER.DISABLED]);
    await expect.poll(() => blueprints.urlParams.get('status')).toBe(BLUEPRINT_STATUS_FILTER.DISABLED);
    await expect.poll(() => blueprints.blueprintNames()).toEqual([names.off]);
    await expect(blueprints.blueprintRow(names.off)).toBeVisible();

    await blueprints.reload();
    await expect.poll(() => blueprints.blueprintNames()).toEqual([names.off]);

    await blueprints.filterByStatus(BLUEPRINT_HOME_COPY.statusFilter[BLUEPRINT_STATUS_FILTER.ENABLED]);
    await expect
      .poll(async () => (await blueprints.blueprintNames()).sort())
      .toEqual([names.first, names.second].sort());
  });

  for (const [mode, article] of [
    ['normal', 'a'],
    ['advanced', 'an'],
  ] as const) {
    test(`create ${article} ${mode} blueprint from the list`, async ({ page }) => {
      const name = `${prefix}-new-${mode}`;
      const blueprints = new BlueprintPage(page);
      await blueprints.open();
      await blueprints.createBlueprint(name, mode);
      await expect(blueprints.toast(/success/i)).toBeVisible();

      const [created] = await listBlueprintsByKeyword(api, name);
      expect(created.mode).toBe(mode.toUpperCase());
      expect(created.enable).toBe(true);
      expect(created.cronConfig).toBe('0 0 * * *');
      expect(created.skipOnFail).toBe(true);
      expect(mode === 'normal' ? created.connections : created.plan).toEqual(mode === 'normal' ? [] : [[]]);
      await blueprints.search(name);
      await expect(blueprints.blueprintRow(name)).toBeVisible();
    });
  }

  test('closing the create dialog returns focus to the New blueprint button', async ({ page }) => {
    const blueprints = new BlueprintPage(page);
    await blueprints.open();
    await blueprints.openCreateDialog();
    await expect(blueprints.dialog(BLUEPRINT_HOME_COPY.create.title)).toBeVisible();
    await blueprints.pressEscape();
    await expect(blueprints.dialog(BLUEPRINT_HOME_COPY.create.title)).toBeHidden();
    await expect(blueprints.ready).toBeFocused();
  });
});
