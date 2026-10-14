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
import { adminApi, createEmailUser, uniqueName } from '../support/api';
import { deleteEmailUsersNamedLike } from '../support/db';
import { ActivityPage } from '../support/pages/activity';
import { SettingsUsersPage } from '../support/pages/settings-users';
import { ShellPage } from '../support/pages/shell';

test.describe('Access Management & Authentication', () => {
  test('loads access page for authenticated admin', async ({ page, context }) => {
    await loginAsAdmin(context);

    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();
    await expect(page).toHaveURL(usersPage.urlPattern);

    // Verify navigation and core access sections are visible
    await expect(new ShellPage(page).usersMenuItem).toBeVisible();
    await expect(usersPage.ready).toBeVisible();

    // Verify user directory heading (People / User Directory)
    const userSection = usersPage.directoryHeading;
    await expect(userSection).toBeVisible();

    // The activity log has its own page
    const activityPage = new ActivityPage(page);
    await activityPage.open();
    await expect(activityPage.recentActivityHeading).toBeVisible();
  });
});

test.describe.serial('Settings users search', () => {
  let api: APIRequestContext;
  const prefix = uniqueName('search');
  const firstEmail = `${prefix}-a@example.com`;
  const secondEmail = `${prefix}-b@example.com`;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    deleteEmailUsersNamedLike(prefix);
    await createEmailUser(api, firstEmail);
    await createEmailUser(api, secondEmail);
  });

  test.afterAll(async () => {
    deleteEmailUsersNamedLike(prefix);
    await api?.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('search narrows the users table by email and survives a reload', async ({ page }) => {
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();
    await usersPage.search(prefix);
    await expect.poll(() => usersPage.urlParams.get('keyword')).toBe(prefix);
    // Neither user has a display name yet, so the row order is the database's.
    await expect.poll(async () => (await usersPage.userIdentities()).sort()).toEqual([firstEmail, secondEmail]);

    await usersPage.search(secondEmail);
    await expect.poll(() => usersPage.userIdentities()).toEqual([secondEmail]);
    await usersPage.reload();
    expect(usersPage.urlParams.get('keyword')).toBe(secondEmail);
    await expect.poll(() => usersPage.userIdentities()).toEqual([secondEmail]);
  });

  test('a search with no match shows the empty state and keeps the keyword', async ({ page }) => {
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();
    const keyword = `${prefix}-no-such-user`;
    await usersPage.search(keyword);
    await expect.poll(() => usersPage.urlParams.get('keyword')).toBe(keyword);
    await expect(usersPage.noResults).toBeVisible();
  });
});
