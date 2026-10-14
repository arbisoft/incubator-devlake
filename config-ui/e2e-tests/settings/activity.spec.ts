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
import { adminApi, createEmailUser, findAuditEventByTarget, uniqueName } from '../support/api';
import { deleteEmailUsersNamedLike } from '../support/db';
import { ActivityPage } from '../support/pages/activity';

test.describe.serial('Settings activity', () => {
  let api: APIRequestContext;
  const prefix = uniqueName('activity');
  const email = `${prefix}@example.com`;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    deleteEmailUsersNamedLike(prefix);
    await createEmailUser(api, email);
  });

  test.afterAll(async () => {
    deleteEmailUsersNamedLike(prefix);
    await api?.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('a row opens a drawer with the event action and target', async ({ page }) => {
    const event = await findAuditEventByTarget(api, email);
    expect(event?.action).toBeTruthy();

    const activityPage = new ActivityPage(page);
    await activityPage.open();
    await activityPage.search(email);
    await activityPage.openEvent(email);

    await expect(activityPage.drawer).toBeVisible();
    await expect(activityPage.drawer).toContainText(event?.action ?? '');
    await expect(activityPage.drawer).toContainText(email);
  });
});
