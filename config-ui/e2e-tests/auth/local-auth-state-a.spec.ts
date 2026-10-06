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
import { loginAsAdmin } from '../auth-helpers';
import { test, expect } from '../fixtures';
import { fetchAuthMethods } from '../support/auth-state';
import { countLocalCredentials } from '../support/db';
import { LoginPage } from '../support/pages/login';
import { SettingsUsersPage } from '../support/pages/settings-users';

test.describe('Phase 1-3 Verification: State A (Local Auth Disabled / Default)', () => {
  test.beforeEach(async ({ request }) => {
    const methods = await fetchAuthMethods(request);
    test.skip(!!methods.localPassword?.enabled, 'Local password authentication is enabled (auth state A is required)');
  });

  test('1. /auth/methods and /login do not render local password form when disabled', async ({ page }) => {
    // Check API methods
    const data = await fetchAuthMethods(page.request);
    expect(data.localPassword?.enabled).toBeFalsy();
    expect(data.providers?.length ?? 0).toBeGreaterThan(0);

    // Check UI login page
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await expect(loginPage.providerButton('Google')).toBeVisible();
    await expect(loginPage.usernameTextbox).not.toBeVisible();
    await expect(loginPage.signInButton).not.toBeVisible();
  });

  test('2. Attempting to create a local user via API when disabled returns 503', async ({ page, context }) => {
    await loginAsAdmin(context);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();
    const credentialsBefore = countLocalCredentials('testadmin');
    const res = await usersPage.sessionFetch('/api/access/local-users', {
      method: 'POST',
      body: { loginName: 'testadmin', displayName: 'Test Admin', role: 'member' },
    });
    expect(res.status).toBe(503);
    expect(countLocalCredentials('testadmin')).toBe(credentialsBefore);
  });
});
