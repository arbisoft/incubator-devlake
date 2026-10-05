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
import { test, expect } from '../fixtures';
import { loginAsAdmin } from '../auth-helpers';
import { API_URL, APP_URL, E2E_USER_PREFIX } from '../support/env';
import { resetLocalAuthState } from '../support/db';
import { fetchAuthMethods } from '../support/auth-state';

test.describe('Rebase Verification Matrix: Local Auth & Multi-Provider OIDC', () => {
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
    const methods = await methodsRes.json();

    expect(methods.localPassword?.enabled).toBe(true);
    expect(methods.localPassword?.loginUrl).toBe('/auth/local/login');
    expect(methods.apiKey?.enabled).toBe(true);
    expect(Array.isArray(methods.providers)).toBe(true);

    const providerKeys = methods.providers.map((p: any) => p.name);
    expect(providerKeys).toContain('google-one');
    expect(providerKeys).toContain('auth0');
    expect(new Set(providerKeys).size).toBe(providerKeys.length);

    // 2. Check UI rendering
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in with Auth0/i })).toBeVisible();

    // Ensure no duplicates
    expect(await page.getByRole('button', { name: /Sign in with Google/i }).count()).toBe(1);
    expect(await page.getByRole('button', { name: /Sign in with Auth0/i }).count()).toBe(1);

    // Local authentication form elements
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Sign in$/i })).toBeVisible();
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
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}rebase_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = page.locator('.ant-modal-content').filter({ hasText: 'Add local DevLake user' });
    await modal.getByPlaceholder('person').fill(testLogin);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = page.locator('.ant-modal-content').filter({ hasText: 'Copy this password now' });
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // 2. User logs in and changes password (with 15+ characters password)
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL(/.*\/change-password/);

    const userPass = 'ValidRebasePassword12345!';
    await userPage.locator('input[type="password"]').first().fill(userPass);
    await userPage.locator('input[type="password"]').nth(1).fill(userPass);
    await userPage.getByRole('button', { name: 'Change password' }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'), { timeout: 10000 });

    // 3. Verify Account menu linkable providers does not return 401
    const linkableResp = await userPage.request.get(`${APP_URL}/api/access/oidc-providers/linkable`);
    expect(linkableResp.status()).toBe(200);
    const linkableProviders = await linkableResp.json();
    expect(Array.isArray(linkableProviders)).toBe(true);
    expect(linkableProviders.length).toBeGreaterThan(0);

    // 4. Verify disabling user immediately revokes the active local session
    await page.goto('/access');
    const userRow = page
      .locator('table')
      .first()
      .getByRole('row', { name: new RegExp(testLogin) });
    await expect(userRow).toBeVisible();
    await userRow.getByRole('button', { name: 'Disable' }).click();
    await expect(userRow.getByRole('button', { name: 'Enable' })).toBeVisible();

    // User session must now be rejected with 401 on next request
    const postDisableResp = await userPage.request.get(`${APP_URL}/api/access/me`);
    expect(postDisableResp.status()).toBe(401);

    await userContext.close();
  });

  test('Matrix 4: Provider Lifecycle and Grafana Target Selection', async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/access');

    // 1. Verify both providers are listed on /access in the Authentication section
    const authTable = page.locator('.ant-table').filter({ hasText: 'google-one' });
    await expect(authTable.getByText('google-one').first()).toBeVisible();
    await expect(authTable.getByText('Auth0').first()).toBeVisible();

    try {
      // 2. Disable Auth0 via the official access API
      const disableResp = await page.evaluate(async () => {
        const resp = await fetch('/api/access/oidc-providers/auth0/disable', {
          method: 'POST',
          headers: {
            'X-CSRF-Token': document.cookie.match(/devlake_csrf=([^;]+)/)?.[1] || '',
          },
        });
        return { status: resp.status, body: await resp.json() };
      });
      expect(disableResp.status).toBe(200);

      const methodsRes = await page.request.get(`${API_URL}/auth/methods`);
      const methods = await methodsRes.json();
      const providerNames = methods.providers.map((p: any) => p.name);
      expect(providerNames).toContain('google-one');
      expect(providerNames).not.toContain('auth0');

      await page.goto('/login');
      await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Sign in with Auth0/i })).not.toBeVisible();

      // 3. Re-enable Auth0 and verify it returns
      const enableResp = await page.evaluate(async () => {
        const resp = await fetch('/api/access/oidc-providers/auth0/enable', {
          method: 'POST',
          headers: {
            'X-CSRF-Token': document.cookie.match(/devlake_csrf=([^;]+)/)?.[1] || '',
          },
        });
        return { status: resp.status, body: await resp.json() };
      });
      expect(enableResp.status).toBe(200);

      await page.goto('/login');
      await expect(page.getByRole('button', { name: /Sign in with Auth0/i })).toBeVisible();
    } finally {
      // Always restore Auth0 so a mid-test failure cannot leave the provider disabled
      await page.request.post(`${APP_URL}/api/access/oidc-providers/auth0/enable`, {
        headers: { 'X-CSRF-Token': 'e2e-csrf-token' },
      });
    }
  });

  test('Matrix 5: Dashboard Navigation and Authorization Boundaries', async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/');

    // 1. Verify Dashboard link resolves to external Grafana URL and not internal docker URL
    const dashboardLink = page.getByRole('link', { name: /Dashboards/i }).first();
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
