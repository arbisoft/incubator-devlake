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
import { adminApi, findAccessUserByLogin, findOidcProvider } from '../support/api';
import { API_URL, APP_URL, E2E_USER_PREFIX } from '../support/env';
import { resetLocalAuthState } from '../support/db';
import { AuthMethods, fetchAuthMethods } from '../support/auth-state';
import { LoginPage } from '../support/pages/login';
import { PATHS } from '../support/pages/paths';
import { SettingsAuthPage } from '../support/pages/settings-auth';
import { SettingsUsersPage } from '../support/pages/settings-users';
import { ShellPage } from '../support/pages/shell';

test.describe('Rebase Verification Matrix: Local Auth & Multi-Provider OIDC', () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test.beforeEach(async ({ request }) => {
    const methods = await fetchAuthMethods(request);
    test.skip(!methods.localPassword?.enabled, 'Local password authentication is disabled (auth state B is required)');
    resetLocalAuthState();
  });

  test.afterEach(async () => {
    resetLocalAuthState();
  });

  test('Matrix 1: Login Method Composition in Combined Mode', async ({ page }) => {
    // 1. Check API methods structure and stability
    const methodsRes = await page.request.get(`${API_URL}/auth/methods`);
    expect(methodsRes.status()).toBe(200);
    const methods: AuthMethods = await methodsRes.json();

    expect(methods.localPassword?.enabled).toBe(true);
    expect(methods.localPassword?.loginUrl).toBe('/auth/local/login');
    expect(methods.apiKey?.enabled).toBe(true);
    expect(Array.isArray(methods.providers)).toBe(true);

    const providerKeys = (methods.providers ?? []).map((p) => p.name);
    expect(providerKeys).toContain('google-one');
    expect(providerKeys).toContain('auth0');
    expect(new Set(providerKeys).size).toBe(providerKeys.length);

    // 2. Check UI rendering
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await expect(loginPage.providerButton('Google')).toBeVisible();
    await expect(loginPage.providerButton('Auth0')).toBeVisible();

    // Ensure no duplicates
    expect(await loginPage.providerButton('Google').count()).toBe(1);
    expect(await loginPage.providerButton('Auth0').count()).toBe(1);

    // Local authentication form elements
    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();
  });

  test('Matrix 2: Provider Initiation and Callback Safety', async ({ page }) => {
    // 1. Google-one initiation
    const googleInitResp = await page.request.get(`${API_URL}/auth/login?provider=google-one`, {
      maxRedirects: 0,
    });
    expect(googleInitResp.status()).toBe(303);
    const googleLocation = googleInitResp.headers()['location'];
    expect(googleLocation).toContain('accounts.google.com');
    expect(googleLocation).toContain('state=');
    expect(googleLocation).not.toContain('client_secret');

    // Check state cookie is set in response headers
    const googleCookieHeader = googleInitResp.headers()['set-cookie'] || '';
    expect(googleCookieHeader).toContain('devlake_oauth_state=');

    // 2. Auth0 initiation
    const auth0InitResp = await page.request.get(`${API_URL}/auth/login?provider=auth0`, {
      maxRedirects: 0,
    });
    expect(auth0InitResp.status()).toBe(303);
    const auth0Location = auth0InitResp.headers()['location'];
    expect(auth0Location).toContain('state=');
    expect(auth0Location).not.toContain('client_secret');
    const auth0CookieHeader = auth0InitResp.headers()['set-cookie'] || '';
    expect(auth0CookieHeader).toContain('devlake_oauth_state=');

    // 3. Callback safety: missing state parameter returns 400 Bad Request
    const badCallbackRes = await page.request.get(`${API_URL}/auth/callback?code=mock-auth-code`);
    expect(badCallbackRes.status()).toBe(400);

    // 4. Callback safety: mismatched/tampered state returns 400 Bad Request
    const tamperedCallbackRes = await page.request.get(
      `${API_URL}/auth/callback?code=mock-auth-code&state=tampered-state-value`,
      {
        headers: {
          Cookie: 'devlake_oauth_state=different-cookie-state',
        },
      },
    );
    expect(tamperedCallbackRes.status()).toBe(400);
    const tamperedBody = await tamperedCallbackRes.text();
    expect(tamperedBody).not.toContain('secret');
    expect(tamperedBody).not.toContain('password');
  });

  test('Matrix 3: Local Session and Identity Linking Regression', async ({ page, context, browser }) => {
    // 1. Admin creates local user
    await loginAsAdmin(context);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}rebase_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin);
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    expect(await findAccessUserByLogin(api, testLogin)).toMatchObject({
      role: 'member',
      status: 'active',
      hasLocalCredential: true,
    });

    // 2. User logs in and changes password (with 15+ characters password)
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPass);
    await userShell.waitUntilUrl(/.*\/change-password/);

    const userPass = 'ValidRebasePassword12345!';
    await userShell.changePassword(userPass);
    await userShell.waitUntilPathLeaves('/change-password', 10000);

    // 3. Verify Account menu linkable providers does not return 401
    const linkableResp = await userPage.request.get(`${APP_URL}/api/access/oidc-providers/linkable`);
    expect(linkableResp.status()).toBe(200);
    const linkableProviders = await linkableResp.json();
    expect(Array.isArray(linkableProviders)).toBe(true);
    expect(linkableProviders.length).toBeGreaterThan(0);

    // 4. Verify disabling user immediately revokes the active local session
    await usersPage.open();
    const userRow = usersPage.userRow(testLogin);
    await expect(userRow.root).toBeVisible();
    await userRow.disable();
    await expect(userRow.enableButton).toBeVisible();
    expect((await findAccessUserByLogin(api, testLogin))?.status).toBe('disabled');

    // User session must now be rejected with 401 on next request
    const postDisableResp = await userPage.request.get(`${APP_URL}/api/access/me`);
    expect(postDisableResp.status()).toBe(401);

    await userContext.close();
  });

  test('Matrix 4: Provider Lifecycle and Grafana Target Selection', async ({ page, context }) => {
    await loginAsAdmin(context);
    const authPage = new SettingsAuthPage(page);
    const loginPage = new LoginPage(page);
    await authPage.open();

    // 1. Verify both providers are listed on /access in the Authentication section
    await expect(authPage.providerLabel('google-one', 'google-one')).toBeVisible();
    await expect(authPage.providerLabel('google-one', 'Auth0')).toBeVisible();

    try {
      // 2. Disable Auth0 via the official access API
      const disableResp = await authPage.disableProvider('auth0');
      expect(disableResp.status).toBe(200);
      expect((await findOidcProvider(api, 'auth0'))?.enabled).toBe(false);

      const methodsRes = await page.request.get(`${API_URL}/auth/methods`);
      const methods: AuthMethods = await methodsRes.json();
      const providerNames = (methods.providers ?? []).map((p) => p.name);
      expect(providerNames).toContain('google-one');
      expect(providerNames).not.toContain('auth0');

      await loginPage.open();
      await expect(loginPage.providerButton('Google')).toBeVisible();
      await expect(loginPage.providerButton('Auth0')).not.toBeVisible();

      // 3. Re-enable Auth0 and verify it returns
      const enableResp = await authPage.enableProvider('auth0');
      expect(enableResp.status).toBe(200);
      expect((await findOidcProvider(api, 'auth0'))?.enabled).toBe(true);

      await loginPage.open();
      await expect(loginPage.providerButton('Auth0')).toBeVisible();
    } finally {
      // Always restore Auth0 so a mid-test failure cannot leave the provider disabled
      await page.request.post(`${APP_URL}/api/access/oidc-providers/auth0/enable`, {
        headers: { 'X-CSRF-Token': 'e2e-csrf-token' },
      });
    }
  });

  test('Matrix 5: Dashboard Navigation and Authorization Boundaries', async ({ page, context }) => {
    await loginAsAdmin(context);
    const shell = new ShellPage(page);
    await shell.visit(PATHS.root);

    // 1. Verify Dashboard link resolves to external Grafana URL and not internal docker URL
    const dashboardLink = shell.dashboardsLink;
    if (await dashboardLink.isVisible()) {
      const href = await dashboardLink.getAttribute('href');
      expect(href).not.toContain('grafana:3000');
    }

    // 2. Verify /api/access/me for active admin returns role customer_admin
    const meRes = await page.request.get(`${APP_URL}/api/access/me`);
    expect(meRes.status()).toBe(200);
    const meData = await meRes.json();
    expect(meData.role).toBe('customer_admin');
    expect(meData.enabled).toBe(true);
  });
});
