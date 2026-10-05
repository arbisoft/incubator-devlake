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
import { countLocalCredentials, passwordHashFor, resetLocalAuthState } from '../support/db';
import { fetchAuthMethods } from '../support/auth-state';
import {
  accessUserRow,
  addLocalUserModal,
  appHeader,
  localUserDisplayNameInput,
  oneTimePasswordModal,
  passwordInputs,
  popconfirm,
  selectBox,
  selectOption,
} from '../support/selectors';

test.describe('Local Password Authentication - Phases 1-4 Full E2E Suite', () => {
  test.beforeEach(async ({ request }) => {
    const methods = await fetchAuthMethods(request);
    test.skip(!methods.localPassword?.enabled, 'Local password authentication is disabled (auth state B is required)');
    resetLocalAuthState();
  });

  test.afterEach(async () => {
    resetLocalAuthState();
  });

  test('1. UI Presentation: /login renders both OIDC providers and Local Sign-In form', async ({ page }) => {
    await page.goto('/login');

    // Both OIDC providers from db-backed multi-provider should be visible
    await expect(page.getByRole('button', { name: /Sign in with Auth0/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();

    // Local authentication form should be visible with proper labels
    const usernameInput = page.getByLabel(/username/i);
    const passwordInput = page.getByLabel(/password/i);
    const signInBtn = page.getByRole('button', { name: /^Sign in$/i });

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(signInBtn).toBeVisible();
  });

  test('2. Form Validation: client enforces non-empty fields', async ({ page }) => {
    await page.goto('/login');
    const signInBtn = page.getByRole('button', { name: /^Sign in$/i });

    // Click sign in with empty fields
    await signInBtn.click();
    await expect(page.getByText('Enter your username.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
  });

  test('3. Credential Failure: generic error prevents account enumeration', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/username/i).fill('nonexistent_user');
    await page.getByLabel(/password/i).fill('NonExistentPass123!');
    await page.getByRole('button', { name: /^Sign in$/i }).click();

    // Unified security message
    await expect(page.getByText('Invalid username or password.')).toBeVisible();
  });

  test('4. Security Throttling: 5 consecutive failures triggers 429 Too Many Requests', async ({ page }) => {
    const username = `${E2E_USER_PREFIX}throttle_${Date.now()}`;

    // Send 5 invalid attempts via API
    for (let i = 1; i <= 5; i++) {
      const resp = await page.request.post(`${API_URL}/auth/local/login`, {
        data: { loginName: username, password: `WrongPassword${i}!` },
      });
      expect(resp.status()).toBe(401);
    }

    // 6th attempt must return 429 Too Many Requests
    const throttledResp = await page.request.post(`${API_URL}/auth/local/login`, {
      data: { loginName: username, password: 'WrongPassword6!' },
    });
    expect(throttledResp.status()).toBe(429);
    const body = await throttledResp.json();
    expect(body.message).toMatch(/too many login attempts/i);
  });

  test('5. Admin Lifecycle: Create local user, copy one-time temp password, verify in table', async ({
    page,
    context,
  }) => {
    await loginAsAdmin(context);
    await page.goto('/access');
    await expect(page).toHaveURL(/.*\/access/);

    // Click Add local user button
    const addLocalUserBtn = page.getByRole('button', { name: 'Add local user' });
    await expect(addLocalUserBtn).toBeVisible();
    await addLocalUserBtn.click();

    // Modal should appear
    const modal = addLocalUserModal(page);
    await expect(modal).toBeVisible();

    const testLogin = `${E2E_USER_PREFIX}user_${Date.now()}`;
    await modal.getByPlaceholder('person').fill(testLogin);
    await localUserDisplayNameInput(modal).fill(`Display ${testLogin}`);

    // Click Create
    await modal.getByRole('button', { name: 'Create' }).click();

    // One-time password modal should appear
    const otpModal = oneTimePasswordModal(page);
    await expect(otpModal).toBeVisible();

    // Capture temporary password from read-only input
    const tempPassInput = otpModal.getByRole('textbox');
    await expect(tempPassInput).toBeVisible();
    const tempPassword = (await tempPassInput.inputValue()).trim();
    expect(tempPassword.length).toBeGreaterThanOrEqual(15);

    // Click Done to close modal
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // User should appear in table with Reset button under Local password column
    const userRow = accessUserRow(page, testLogin);
    await expect(userRow).toBeVisible();
    await expect(userRow.getByRole('button', { name: 'Reset' })).toBeVisible();
  });

  test('6. Complete Flow: Local creation -> First sign-in -> Forced change redirect -> API Gate -> Change pass -> Direct sign-in', async ({
    page,
    context,
    browser,
  }) => {
    // A. Create user as admin
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}flow_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();

    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await localUserDisplayNameInput(modal).fill(`Flow ${testLogin}`);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    await expect(otpModal).toBeVisible();
    const tempPassInput = otpModal.getByRole('textbox');
    await expect(tempPassInput).toBeVisible();
    const tempPassword = (await tempPassInput.inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // B. New incognito context for the local user
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();

    // Attempt sign in with temp password
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPassword);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();

    // Should immediately redirect to /change-password
    await expect(userPage).toHaveURL(/.*\/change-password/);
    await expect(userPage.getByText('Change your password')).toBeVisible();
    await expect(userPage.getByText('Choose a new password to continue.')).toBeVisible();

    // C. Verify Server Gate: attempting to call protected API while MustChangePassword=true fails with 403
    const gateCheck = await userPage.evaluate(async () => {
      const resp = await fetch('/api/projects');
      return { status: resp.status, body: await resp.json() };
    });
    expect(gateCheck.status).toBe(403);
    expect(gateCheck.body.message).toMatch(/password change required/i);

    // D. Password complexity validation: too short password (< 15 chars)
    const newPassInput = passwordInputs(userPage).first();
    const confirmPassInput = passwordInputs(userPage).nth(1);
    const changeBtn = userPage.getByRole('button', { name: 'Change password' });

    await newPassInput.fill('shortpass1');
    await confirmPassInput.fill('shortpass1');
    await changeBtn.click();
    await expect(userPage.getByText('Use at least 15 characters.')).toBeVisible();

    // Mismatched passwords
    await newPassInput.fill('ValidLongPassword12345!');
    await confirmPassInput.fill('DifferentPassword12345!');
    await changeBtn.click();
    await expect(userPage.getByText('Passwords do not match.')).toBeVisible();

    // E. Successful password change (>= 15 characters and matching)
    const validPermanentPassword = 'PermanentPass123456789!';
    await newPassInput.fill(validPermanentPassword);
    await confirmPassInput.fill(validPermanentPassword);
    await changeBtn.click();

    // Should redirect away from /change-password (to /connections)
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'), { timeout: 10000 });

    // F. Verify Server Gate is lifted
    const gateCheckAfter = await userPage.evaluate(async () => {
      const resp = await fetch('/api/projects');
      return { status: resp.status };
    });
    expect(gateCheckAfter.status).toBe(200);

    // G. Log out and sign in with permanent password directly
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(validPermanentPassword);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();

    // Does NOT redirect to /change-password
    await userPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    expect(userPage.url()).not.toContain('/change-password');

    await userContext.close();
  });

  test('7. Admin Actions: Password Reset revokes active sessions and issues new temporary credentials', async ({
    page,
    context,
    browser,
  }) => {
    // Create local user
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}reset_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await localUserDisplayNameInput(modal).fill(`Reset Test ${testLogin}`);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    await expect(otpModal).toBeVisible();
    const tempPass1 = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // User completes first login and password change
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPass1);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL(/.*\/change-password/);

    const userPass = 'MyUserPassword12345!';
    await passwordInputs(userPage).first().fill(userPass);
    await passwordInputs(userPage).nth(1).fill(userPass);
    await userPage.getByRole('button', { name: 'Change password' }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'));

    // Admin resets user password
    await page.goto('/access');
    const userRow = accessUserRow(page, testLogin);
    await expect(userRow).toBeVisible();

    // Click Reset in Local password column
    await userRow.getByRole('button', { name: 'Reset' }).click();

    // Confirm popconfirm
    const resetConfirm = popconfirm(page);
    await resetConfirm.getByRole('button', { name: 'Reset' }).click();

    // New OTP modal appears
    const newOtpModal = oneTimePasswordModal(page);
    await expect(newOtpModal).toBeVisible();
    const tempPass2 = (await newOtpModal.getByRole('textbox').inputValue()).trim();
    expect(tempPass2).not.toBe(tempPass1);
    await newOtpModal.getByRole('button', { name: 'Done' }).click();

    // Verify user's old session is now REVOKED (returns 401)
    const sessionCheck = await userPage.evaluate(async () => {
      const resp = await fetch('/api/access/me');
      return resp.status;
    });
    expect(sessionCheck).toBe(401);

    await userContext.close();
  });

  test('8. Account Disablement: Disabling user revokes active sessions and prevents authentication', async ({
    page,
    context,
    browser,
  }) => {
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}disable_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await localUserDisplayNameInput(modal).fill(`Disable Test ${testLogin}`);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    await expect(otpModal).toBeVisible();
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // User logs in and changes password
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL(/.*\/change-password/);

    const userPass = 'DisableTestPassword123!';
    await passwordInputs(userPage).first().fill(userPass);
    await passwordInputs(userPage).nth(1).fill(userPass);
    await userPage.getByRole('button', { name: 'Change password' }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'));

    // Admin disables user
    await page.goto('/access');
    const userRow = accessUserRow(page, testLogin);
    await expect(userRow).toBeVisible();

    await userRow.getByRole('button', { name: 'Disable' }).click();
    await expect(userRow.getByRole('button', { name: 'Enable' })).toBeVisible();

    // User's active session is terminated
    const sessionCheck = await userPage.evaluate(async () => {
      const resp = await fetch('/api/access/me');
      return resp.status;
    });
    expect(sessionCheck).toBe(401);

    // Attempting to log in as disabled user is rejected
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(userPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(userPage.getByText('Invalid username or password.')).toBeVisible();

    await userContext.close();
  });

  test('9. Malformed Form Values: invalid usernames and passwords get the uniform 401, malformed bodies get 400', async ({
    page,
  }) => {
    const invalidCredentialBodies = [
      { password: 'ValidPassword123!' },
      { loginName: '   ', password: 'ValidPassword123!' },
      { loginName: 'bad@name!', password: 'ValidPassword123!' },
      { loginName: 'testuser', password: 'A'.repeat(2048) },
    ];
    for (const data of invalidCredentialBodies) {
      const res = await page.request.post(`${API_URL}/auth/local/login`, { data });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.message).toMatch(/invalid username or password/i);
      expect(JSON.stringify(body)).not.toContain('A'.repeat(100));
    }

    // Unparseable JSON is the only input rejected before credential checks
    const malformed = await page.request.post(`${API_URL}/auth/local/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: '{"loginName": ',
    });
    expect(malformed.status()).toBe(400);
    expect((await malformed.json()).message).toMatch(/invalid local login request/i);
  });

  test('10. Account Re-enablement: Admin re-enabling user restores valid authentication', async ({
    page,
    context,
    browser,
  }) => {
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}reenable_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await localUserDisplayNameInput(modal).fill(`Re-enable ${testLogin}`);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    await expect(otpModal).toBeVisible();
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // User completes initial login and sets permanent password
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL(/.*\/change-password/);

    const userPass = 'ReenablePass123456!';
    await passwordInputs(userPage).first().fill(userPass);
    await passwordInputs(userPage).nth(1).fill(userPass);
    await userPage.getByRole('button', { name: 'Change password' }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'));

    // Admin disables user
    await page.goto('/access');
    const userRow = accessUserRow(page, testLogin);
    await expect(userRow).toBeVisible();
    await userRow.getByRole('button', { name: 'Disable' }).click();
    await expect(userRow.getByRole('button', { name: 'Enable' })).toBeVisible();

    // Verify disabled user cannot log in
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(userPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(userPage.getByText('Invalid username or password.')).toBeVisible();

    // Admin re-enables user
    await userRow.getByRole('button', { name: 'Enable' }).click();
    await expect(userRow.getByRole('button', { name: 'Disable' })).toBeVisible();

    // Verify user can now log in successfully with permanent password
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(userPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    expect(userPage.url()).not.toContain('/login');

    await userContext.close();
  });

  test('11. Session Logout: Normal user sign-in followed by logout clears session', async ({
    page,
    context,
    browser,
  }) => {
    // Admin creates local user
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}logout_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await localUserDisplayNameInput(modal).fill(`Logout ${testLogin}`);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // User logs in and changes password
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL(/.*\/change-password/);

    const userPass = 'LogoutPass1234567!';
    await passwordInputs(userPage).first().fill(userPass);
    await passwordInputs(userPage).nth(1).fill(userPass);
    await userPage.getByRole('button', { name: 'Change password' }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'));

    // Verify authenticated API call succeeds
    const meBefore = await userPage.request.get(`${APP_URL}/api/access/me`);
    expect(meBefore.status()).toBe(200);

    // Call logout endpoint via user page with CSRF header
    await userPage.evaluate(async () => {
      const csrf =
        document.cookie
          .split('; ')
          .find((r) => r.startsWith('devlake_csrf='))
          ?.split('=')[1] ?? '';
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf },
      });
    });

    // Verify authenticated API call now returns 401
    const meAfter = await userPage.request.get(`${APP_URL}/api/access/me`);
    expect(meAfter.status()).toBe(401);

    // Navigating to protected page redirects to /login
    // A blank page starts the navigation from inside, so the app's own redirect to /login cannot abort a goto.
    const freshPage = await userContext.newPage();
    await freshPage.evaluate((url) => setTimeout(() => window.location.assign(url), 0), `${APP_URL}/connections`);
    await freshPage.waitForURL(/.*\/login/);
    expect(freshPage.url()).toContain('/login');

    await userContext.close();
  });

  test('12. Credential Removal: Deleting local credential terminates authentication capabilities', async ({
    page,
    context,
  }) => {
    const adminAuth = await loginAsAdmin(context);
    await page.goto('/access');

    // Create a local user
    const testLogin = `${E2E_USER_PREFIX}removemethod_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await localUserDisplayNameInput(modal).fill(`RemoveMethod ${testLogin}`);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    await expect(otpModal).toBeVisible();
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // Query for the created user's ID
    const usersResp = await page.request.get(`${API_URL}/access/users`, {
      headers: {
        Cookie: `devlake_session=${adminAuth.token}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    expect(usersResp.status()).toBe(200);
    const usersData = await usersResp.json();
    const targetUser = usersData.users.find((u: any) => u.localLoginName === testLogin);
    expect(targetUser).toBeDefined();

    // Admin deletes the local credential for this user
    const delResp = await page.request.delete(`${API_URL}/access/users/${targetUser.id}/local-credential`, {
      headers: {
        Cookie: `devlake_session=${adminAuth.token}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    expect(delResp.status()).toBe(200);

    // Verify local credential is removed from database
    expect(countLocalCredentials(testLogin)).toBe(0);

    // Attempting to log in as user after credential removal fails with generic 401
    const loginAttempt = await page.request.post(`${API_URL}/auth/local/login`, {
      data: { loginName: testLogin, password: tempPass },
    });
    expect(loginAttempt.status()).toBe(401);

    // The credential-less person is no longer matched by resetLocalAuthState, so hide it here to avoid filling the users table.
    const hideResp = await page.request.post(`${API_URL}/access/users/${targetUser.id}/hide`, {
      headers: {
        Cookie: `devlake_session=${adminAuth.token}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    expect(hideResp.status()).toBe(200);
  });

  test('13. Privilege Boundary: Member role cannot access /access or invoke admin user management endpoints', async ({
    page,
    context,
    browser,
  }) => {
    // Admin creates member user
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}member_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await localUserDisplayNameInput(modal).fill(`Member ${testLogin}`);
    // Select Member role
    await selectBox(modal).click();
    await selectOption(page, /^Member$/).click();
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // Member signs in and completes password change
    const memberContext = await browser.newContext({ baseURL: APP_URL });
    const memberPage = await memberContext.newPage();
    await memberPage.goto('/login');
    await memberPage.getByLabel(/username/i).fill(testLogin);
    await memberPage.getByLabel(/password/i).fill(tempPass);
    await memberPage.getByRole('button', { name: /^Sign in$/i }).click();
    await memberPage.waitForURL(/.*\/change-password/);

    const memberPass = 'MemberPassword12345!';
    await passwordInputs(memberPage).first().fill(memberPass);
    await passwordInputs(memberPage).nth(1).fill(memberPass);
    await memberPage.getByRole('button', { name: 'Change password' }).click();
    await memberPage.waitForURL((url) => !url.pathname.includes('/change-password'));

    // Member attempts to navigate to /access directly in browser
    await memberPage.goto('/access');
    // Client router accessLoader redirects member away from /access
    await memberPage.waitForURL((url) => !url.pathname.includes('/access'), { timeout: 5000 });
    expect(memberPage.url()).not.toContain('/access');

    // Member attempts to call admin API POST /api/access/local-users directly
    const apiAttempt = await memberPage.evaluate(async (loginName) => {
      const csrf =
        document.cookie
          .split('; ')
          .find((r) => r.startsWith('devlake_csrf='))
          ?.split('=')[1] ?? '';
      const resp = await fetch('/api/access/local-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ loginName, role: 'customer_admin' }),
      });
      return { status: resp.status, body: await resp.json() };
    }, `${E2E_USER_PREFIX}hacked_admin`);
    expect(apiAttempt.status).toBe(403);
    expect(apiAttempt.body.message).toMatch(/customer administrator access is required/i);

    await memberContext.close();
  });

  test('14. User Management Validation: duplicate username triggers error and client format guards', async ({
    page,
    context,
  }) => {
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}dup_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    const usernameInput = modal.getByPlaceholder('person');
    const createBtn = modal.getByRole('button', { name: 'Create' });

    // Client format validation: too short (<3 chars)
    await usernameInput.fill('ab');
    await expect(
      page.getByText('Use 3-64 letters, numbers, dots, underscores, or hyphens, starting with a letter or number.'),
    ).toBeVisible();
    await expect(createBtn).toBeDisabled();

    // Valid format: create the user
    await usernameInput.fill(testLogin);
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    const otpModal = oneTimePasswordModal(page);
    await expect(otpModal).toBeVisible();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // Now attempt to create user with the exact same username
    await page.getByRole('button', { name: 'Add local user' }).click();
    const dupModal = addLocalUserModal(page);
    await dupModal.getByPlaceholder('person').fill(testLogin);
    await dupModal.getByRole('button', { name: 'Create' }).click();

    // Error message displayed and modal does not succeed
    await expect(page.getByText(/already has a DevLake (local password|access entry)/i)).toBeVisible();
    await dupModal.getByRole('button', { name: 'Cancel' }).click();
  });

  test('15. Grafana Identity Boundary: Local-only user navigating to /grafana-login receives independent login fallback', async ({
    page,
    context,
    browser,
  }) => {
    // Admin creates local user
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}grafana_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // User completes first login
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL(/.*\/change-password/);

    const userPass = 'GrafanaFallbackPass123!';
    await passwordInputs(userPage).first().fill(userPass);
    await passwordInputs(userPage).nth(1).fill(userPass);
    await userPage.getByRole('button', { name: 'Change password' }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'));

    // Direct request to /api/access/grafana-login without following redirect
    const grafanaRedirect = await userPage.request.get(`${APP_URL}/api/access/grafana-login`, {
      maxRedirects: 0,
    });
    // DevLake returns 302 Found redirecting to Grafana's independent public login
    expect(grafanaRedirect.status()).toBe(302);
    const location = grafanaRedirect.headers()['location'];
    expect(location).toMatch(/(:3002\/login|\/grafana\/)/);

    await userContext.close();
  });

  test('16. Security & Secret Boundary: Verification of password hashing, API sanitization, and header spoofing defense', async ({
    page,
    context,
  }) => {
    const adminAuth = await loginAsAdmin(context);
    await page.goto('/access');

    // Create a local user
    const testLogin = `${E2E_USER_PREFIX}sec_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // 1. Verify GET /access/users does NOT expose plaintext password or password hash
    const usersResp = await page.request.get(`${API_URL}/access/users`, {
      headers: {
        Cookie: `devlake_session=${adminAuth.token}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    expect(usersResp.status()).toBe(200);
    const usersBody = await usersResp.text();
    expect(usersBody).not.toContain(tempPass);
    expect(usersBody).not.toContain('$argon2id$');
    expect(usersBody).not.toContain('passwordHash');

    // 2. Verify GET /access/audit-events does NOT expose password material
    const auditResp = await page.request.get(`${API_URL}/access/audit-events`, {
      headers: {
        Cookie: `devlake_session=${adminAuth.token}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    expect(auditResp.status()).toBe(200);
    const auditBody = await auditResp.text();
    expect(auditBody).not.toContain(tempPass);
    expect(auditBody).not.toContain('$argon2id$');

    // 3. Verify Database rows store only Argon2id hash
    const dbCheck = passwordHashFor(testLogin);
    expect(dbCheck).toContain('$argon2id$');
    expect(dbCheck).not.toContain(tempPass);

    // 4. Verify spoofed X-Forwarded-User header without session cookie is rejected
    const spoofResp = await fetch(`${API_URL}/access/me`, {
      headers: {
        'X-Forwarded-User': 'admin@example.com',
        'X-Forwarded-Email': 'admin@example.com',
      },
    });
    expect(spoofResp.status).toBe(401);
  });

  test('17. Account Menu & Linkable Providers Regression: Local user opening account menu fetches linkable providers (200 OK) without 401 logout redirect', async ({
    page,
    context,
    browser,
  }) => {
    // 1. Admin creates local user
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}menu_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // 2. User completes first-time login and password change
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL(/.*\/change-password/);

    const userPass = 'ValidLinkUser123!';
    await passwordInputs(userPage).first().fill(userPass);
    await passwordInputs(userPage).nth(1).fill(userPass);
    await userPage.getByRole('button', { name: 'Change password' }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'));

    // Verify user is in authenticated session
    await expect(userPage).not.toHaveURL(/.*\/login/);

    // 3. User clicks on the Account menu in the header
    // In layout.tsx: <Dropdown menu={{ items: accountMenuItems }} onOpenChange={loadLinkableProviders}>
    // <Button type="text" icon={<UserOutlined />}>{user.name || user.email || 'Account'}</Button>
    const userMenuButton = appHeader(userPage).getByRole('button', { name: new RegExp(testLogin, 'i') });
    await expect(userMenuButton).toBeVisible();

    // Intercept the /api/access/oidc-providers/linkable request
    const linkablePromise = userPage.waitForResponse((response) =>
      response.url().includes('/api/access/oidc-providers/linkable'),
    );

    await userMenuButton.click();

    const linkableResponse = await linkablePromise;
    // Regression check: Status MUST be 200 OK, not 401 Unauthorized
    expect(linkableResponse.status()).toBe(200);

    const linkableData = await linkableResponse.json();
    expect(Array.isArray(linkableData)).toBe(true);
    // Enabled providers (e.g. google-one, auth0) should be returned
    const providerKeys = linkableData.map((p: any) => p.providerKey);
    expect(providerKeys).toContain('google-one');

    // Regression check: Frontend global interceptor must NOT redirect user to /login
    await userPage.waitForTimeout(2000);
    expect(userPage.url()).not.toContain('/login');

    // Menu options for linking should be visible
    await expect(userPage.getByText(/Add Google sign-in/i)).toBeVisible();
    await expect(userPage.getByText(/Sign out/i)).toBeVisible();

    // Verify user session remains valid
    const meResp = await userPage.request.get(`${APP_URL}/api/access/me`);
    expect(meResp.status()).toBe(200);
    const meData = await meResp.json();
    expect(meData.enabled).toBe(true);
    expect(meData.role).toBe('member');

    const userInfoResp = await userPage.request.get(`${API_URL}/auth/userinfo`);
    expect(userInfoResp.status()).toBe(200);
    const userInfo = await userInfoResp.json();
    expect(userInfo.authenticated).toBe(true);
    expect(userInfo.name).toBe(testLogin);

    await userContext.close();
  });

  test('18. Identity Link Initiation for Local User: Local session can initiate OIDC provider link without 401', async ({
    page,
    context,
    browser,
  }) => {
    // 1. Admin creates local user
    await loginAsAdmin(context);
    await page.goto('/access');

    const testLogin = `${E2E_USER_PREFIX}link_${Date.now()}`;
    await page.getByRole('button', { name: 'Add local user' }).click();
    const modal = addLocalUserModal(page);
    await modal.getByPlaceholder('person').fill(testLogin);
    await modal.getByRole('button', { name: 'Create' }).click();

    const otpModal = oneTimePasswordModal(page);
    const tempPass = (await otpModal.getByRole('textbox').inputValue()).trim();
    await otpModal.getByRole('button', { name: 'Done' }).click();

    // 2. User completes first-time login
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel(/username/i).fill(testLogin);
    await userPage.getByLabel(/password/i).fill(tempPass);
    await userPage.getByRole('button', { name: /^Sign in$/i }).click();
    await userPage.waitForURL(/.*\/change-password/);

    const userPass = 'ValidLinkInit123!';
    await passwordInputs(userPage).first().fill(userPass);
    await passwordInputs(userPage).nth(1).fill(userPass);
    await userPage.getByRole('button', { name: 'Change password' }).click();
    await userPage.waitForURL((url) => !url.pathname.includes('/change-password'));

    // 3. Directly call GET /auth/link-identity?provider=google-one via user context
    // Before the fix, this endpoint returned 401 Unauthorized because GetIdentity(c) was missing.
    // With the fix, it returns 303 See Other redirecting to IdP authorization URL.
    const linkResp = await userPage.request.get(`${API_URL}/auth/link-identity?provider=google-one&return_url=%2F`, {
      maxRedirects: 0,
    });
    expect(linkResp.status()).toBe(303);
    const redirectUrl = linkResp.headers()['location'];
    expect(redirectUrl).toMatch(/accounts\.google\.com/);
    expect(redirectUrl).toContain('state=');

    // 4. Boundary check: Unauthenticated call without session cookie must return 401
    const unauthContext = await browser.newContext();
    const unauthPage = await unauthContext.newPage();
    const unauthResp = await unauthPage.request.get(`${API_URL}/access/oidc-providers/linkable`);
    expect(unauthResp.status()).toBe(401);
    await unauthContext.close();

    await userContext.close();
  });

  test('19. All Providers Linked Boundary: OIDC session with all providers linked displays disabled indicator without logout', async ({
    page,
    context,
  }) => {
    // Admin (user ID 1) has both Google and Auth0 linked
    await loginAsAdmin(context);
    await page.goto('/access');

    // Click Account dropdown
    const userMenuButton = appHeader(page).getByRole('button', {
      name: new RegExp(`Account|${process.env.E2E_ADMIN_NAME ?? 'Account'}`, 'i'),
    });
    await expect(userMenuButton).toBeVisible();

    const linkablePromise = page.waitForResponse((response) =>
      response.url().includes('/api/access/oidc-providers/linkable'),
    );

    await userMenuButton.click();

    const linkableResponse = await linkablePromise;
    expect(linkableResponse.status()).toBe(200);
    const linkableData = await linkableResponse.json();
    // All enabled providers are already linked for admin user 1, so linkable array is empty
    expect(Array.isArray(linkableData)).toBe(true);
    test.skip(
      linkableData.length > 0,
      'Admin identity has unlinked providers; this boundary needs an admin linked to every enabled provider',
    );
    expect(linkableData.length).toBe(0);

    // UI shows "No additional sign-in providers" disabled menu item
    await expect(page.getByText('No additional sign-in providers')).toBeVisible();
    await expect(page.getByText(/Sign out/i)).toBeVisible();

    // Verify session remains intact
    expect(page.url()).not.toContain('/login');
  });
});
