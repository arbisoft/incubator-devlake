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
import { fetchAuthMethods } from '../support/auth-state';

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
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Username/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Sign in$/i })).not.toBeVisible();
  });

  test('2. Attempting to create a local user via API when disabled returns 503', async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/access');
    const res = await page.evaluate(async () => {
      const resp = await fetch('/api/access/local-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.cookie.match(/devlake_csrf=([^;]+)/)?.[1] || '',
        },
        body: JSON.stringify({
          loginName: 'testadmin',
          displayName: 'Test Admin',
          role: 'member',
        }),
      });
      return { status: resp.status, body: await resp.json() };
    });
    expect(res.status).toBe(503);
  });
});
