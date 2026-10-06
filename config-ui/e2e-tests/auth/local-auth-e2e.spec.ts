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
import { ApiAccessUser, ApiMessage, adminApi, findAccessUserByLogin, listAccessUsers } from '../support/api';
import { fetchAuthMethods } from '../support/auth-state';
import { countLocalCredentials, mustChangePasswordFor, passwordHashFor, resetLocalAuthState } from '../support/db';
import { API_URL, APP_URL, E2E_USER_PREFIX } from '../support/env';
import { LoginPage } from '../support/pages/login';
import { SettingsUsersPage } from '../support/pages/settings-users';
import { ShellPage } from '../support/pages/shell';

test.describe('Local Password Authentication - Phases 1-4 Full E2E Suite', () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  // The backend directory holds the new local user as an active person with a local credential.
  const expectLocalUser = async (login: string, role = 'member') =>
    expect(await findAccessUserByLogin(api, login)).toMatchObject({
      role,
      status: 'active',
      hasLocalCredential: true,
    });

  test.beforeEach(async ({ request }) => {
    const methods = await fetchAuthMethods(request);
    test.skip(!methods.localPassword?.enabled, 'Local password authentication is disabled (auth state B is required)');
    resetLocalAuthState();
  });

  test.afterEach(async () => {
    resetLocalAuthState();
  });

  test('1. UI Presentation: /login renders both OIDC providers and Local Sign-In form', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();

    // Both OIDC providers from db-backed multi-provider should be visible
    await expect(loginPage.providerButton('Auth0')).toBeVisible();
    await expect(loginPage.providerButton('Google')).toBeVisible();

    // Local authentication form should be visible with proper labels
    const usernameInput = loginPage.usernameInput;
    const passwordInput = loginPage.passwordInput;
    const signInBtn = loginPage.signInButton;

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(signInBtn).toBeVisible();
  });

  test('2. Form Validation: client enforces non-empty fields', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();

    // Click sign in with empty fields
    await loginPage.submit();
    await expect(loginPage.usernameRequiredError).toBeVisible();
    await expect(loginPage.passwordRequiredError).toBeVisible();
  });

  test('3. Credential Failure: generic error prevents account enumeration', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();

    await loginPage.signIn('nonexistent_user', 'NonExistentPass123!');

    // Unified security message
    await expect(loginPage.invalidCredentialsError).toBeVisible();
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
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();
    await expect(page).toHaveURL(/.*\/access/);

    // Click Add local user button
    await expect(usersPage.addLocalUserButton).toBeVisible();
    const form = await usersPage.openAddLocalUser();

    // Modal should appear
    await expect(form.dialog).toBeVisible();

    const testLogin = `${E2E_USER_PREFIX}user_${Date.now()}`;
    await form.fillUsername(testLogin);
    await form.fillDisplayName(`Display ${testLogin}`);

    // Click Create
    const otpDialog = await form.create();

    // One-time password modal should appear
    await expect(otpDialog.dialog).toBeVisible();

    // Capture temporary password from read-only input
    await expect(otpDialog.passwordInput).toBeVisible();
    const tempPassword = await otpDialog.readPassword();
    expect(tempPassword.length).toBeGreaterThanOrEqual(15);

    // Click Done to close modal
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // User should appear in table with Reset button under Local password column
    const userRow = usersPage.userRow(testLogin);
    await expect(userRow.root).toBeVisible();
    await expect(userRow.resetButton).toBeVisible();
    expect(await findAccessUserByLogin(api, testLogin)).toMatchObject({ displayName: `Display ${testLogin}` });
    expect(mustChangePasswordFor(testLogin)).toBe(true);
  });

  test('6. Complete Flow: Local creation -> First sign-in -> Forced change redirect -> API Gate -> Change pass -> Direct sign-in', async ({
    page,
    context,
    browser,
  }) => {
    // A. Create user as admin
    await loginAsAdmin(context);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}flow_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin, { displayName: `Flow ${testLogin}` });
    await expect(otpDialog.dialog).toBeVisible();
    await expect(otpDialog.passwordInput).toBeVisible();
    const tempPassword = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);
    const tempHash = passwordHashFor(testLogin);
    expect(mustChangePasswordFor(testLogin)).toBe(true);

    // B. New incognito context for the local user
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);

    // Attempt sign in with temp password
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPassword);

    // Should immediately redirect to /change-password
    await expect(userPage).toHaveURL(/.*\/change-password/);
    await expect(userShell.changePasswordTitle).toBeVisible();
    await expect(userShell.changePasswordPrompt).toBeVisible();

    // C. Verify Server Gate: attempting to call protected API while MustChangePassword=true fails with 403
    const gateCheck = await userShell.sessionFetch<ApiMessage>('/api/projects');
    expect(gateCheck.status).toBe(403);
    expect(gateCheck.body?.message).toMatch(/password change required/i);

    // D. Password complexity validation: too short password (< 15 chars)
    await userShell.changePassword('shortpass1');
    await expect(userShell.passwordTooShortError).toBeVisible();

    // Mismatched passwords
    await userShell.changePassword('ValidLongPassword12345!', 'DifferentPassword12345!');
    await expect(userShell.passwordMismatchError).toBeVisible();

    // E. Successful password change (>= 15 characters and matching)
    const validPermanentPassword = 'PermanentPass123456789!';
    await userShell.changePassword(validPermanentPassword);

    // Should redirect away from /change-password (to /connections)
    await userShell.waitUntilPathLeaves('/change-password', 10000);
    expect(mustChangePasswordFor(testLogin)).toBe(false);
    expect(passwordHashFor(testLogin)).not.toBe(tempHash);

    // F. Verify Server Gate is lifted
    const gateCheckAfter = await userShell.sessionFetch('/api/projects');
    expect(gateCheckAfter.status).toBe(200);

    // G. Log out and sign in with permanent password directly
    await userLogin.open();
    await userLogin.signIn(testLogin, validPermanentPassword);

    // Does NOT redirect to /change-password
    await userShell.waitUntilPathLeaves('/login', 10000);
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
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}reset_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin, { displayName: `Reset Test ${testLogin}` });
    await expect(otpDialog.dialog).toBeVisible();
    const tempPass1 = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // User completes first login and password change
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPass1);
    await userShell.waitUntilUrl(/.*\/change-password/);

    const userPass = 'MyUserPassword12345!';
    await userShell.changePassword(userPass);
    await userShell.waitUntilPathLeaves('/change-password');
    const changedHash = passwordHashFor(testLogin);
    expect(mustChangePasswordFor(testLogin)).toBe(false);

    // Admin resets user password
    await usersPage.open();
    const userRow = usersPage.userRow(testLogin);
    await expect(userRow.root).toBeVisible();

    // Click Reset in Local password column and confirm the popup
    const newOtpDialog = await userRow.reset();

    // New OTP modal appears
    await expect(newOtpDialog.dialog).toBeVisible();
    const tempPass2 = await newOtpDialog.readPassword();
    expect(tempPass2).not.toBe(tempPass1);
    await newOtpDialog.done();
    expect(mustChangePasswordFor(testLogin)).toBe(true);
    expect(passwordHashFor(testLogin)).not.toBe(changedHash);
    await expectLocalUser(testLogin);

    // Verify user's old session is now REVOKED (returns 401)
    const sessionCheck = (await userShell.sessionFetch('/api/access/me')).status;
    expect(sessionCheck).toBe(401);

    await userContext.close();
  });

  test('8. Account Disablement: Disabling user revokes active sessions and prevents authentication', async ({
    page,
    context,
    browser,
  }) => {
    await loginAsAdmin(context);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}disable_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin, { displayName: `Disable Test ${testLogin}` });
    await expect(otpDialog.dialog).toBeVisible();
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // User logs in and changes password
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPass);
    await userShell.waitUntilUrl(/.*\/change-password/);

    const userPass = 'DisableTestPassword123!';
    await userShell.changePassword(userPass);
    await userShell.waitUntilPathLeaves('/change-password');

    // Admin disables user
    await usersPage.open();
    const userRow = usersPage.userRow(testLogin);
    await expect(userRow.root).toBeVisible();

    await userRow.disable();
    await expect(userRow.enableButton).toBeVisible();
    expect((await findAccessUserByLogin(api, testLogin))?.status).toBe('disabled');

    // User's active session is terminated
    const sessionCheck = (await userShell.sessionFetch('/api/access/me')).status;
    expect(sessionCheck).toBe(401);

    // Attempting to log in as disabled user is rejected
    await userLogin.open();
    await userLogin.signIn(testLogin, userPass);
    await expect(userLogin.invalidCredentialsError).toBeVisible();

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
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}reenable_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin, { displayName: `Re-enable ${testLogin}` });
    await expect(otpDialog.dialog).toBeVisible();
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // User completes initial login and sets permanent password
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPass);
    await userShell.waitUntilUrl(/.*\/change-password/);

    const userPass = 'ReenablePass123456!';
    await userShell.changePassword(userPass);
    await userShell.waitUntilPathLeaves('/change-password');

    // Admin disables user
    await usersPage.open();
    const userRow = usersPage.userRow(testLogin);
    await expect(userRow.root).toBeVisible();
    await userRow.disable();
    await expect(userRow.enableButton).toBeVisible();
    expect((await findAccessUserByLogin(api, testLogin))?.status).toBe('disabled');

    // Verify disabled user cannot log in
    await userLogin.open();
    await userLogin.signIn(testLogin, userPass);
    await expect(userLogin.invalidCredentialsError).toBeVisible();

    // Admin re-enables user
    await userRow.enable();
    await expect(userRow.disableButton).toBeVisible();
    await expectLocalUser(testLogin);

    // Verify user can now log in successfully with permanent password
    await userLogin.open();
    await userLogin.signIn(testLogin, userPass);
    await userShell.waitUntilPathLeaves('/login', 10000);
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
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}logout_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin, { displayName: `Logout ${testLogin}` });
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // User logs in and changes password
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPass);
    await userShell.waitUntilUrl(/.*\/change-password/);

    const userPass = 'LogoutPass1234567!';
    await userShell.changePassword(userPass);
    await userShell.waitUntilPathLeaves('/change-password');

    // Verify authenticated API call succeeds
    const meBefore = await userPage.request.get(`${APP_URL}/api/access/me`);
    expect(meBefore.status()).toBe(200);

    // Call logout endpoint via user page with CSRF header
    await userShell.sessionFetch('/api/auth/logout', { method: 'POST' });

    // Verify authenticated API call now returns 401
    const meAfter = await userPage.request.get(`${APP_URL}/api/access/me`);
    expect(meAfter.status()).toBe(401);

    // Navigating to protected page redirects to /login
    // A blank page starts the navigation from inside, so the app's own redirect to /login cannot abort a goto.
    const freshPage = await userContext.newPage();
    const freshShell = new ShellPage(freshPage);
    await freshShell.assignLocation(`${APP_URL}/connections`);
    await freshShell.waitUntilUrl(/.*\/login/);
    expect(freshPage.url()).toContain('/login');

    await userContext.close();
  });

  test('12. Credential Removal: Deleting local credential terminates authentication capabilities', async ({
    page,
    context,
  }) => {
    const adminAuth = await loginAsAdmin(context);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    // Create a local user
    const testLogin = `${E2E_USER_PREFIX}removemethod_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin, { displayName: `RemoveMethod ${testLogin}` });
    await expect(otpDialog.dialog).toBeVisible();
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // Query for the created user's ID
    const usersResp = await page.request.get(`${API_URL}/access/users`, {
      headers: {
        Cookie: `devlake_session=${adminAuth.token}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    expect(usersResp.status()).toBe(200);
    const usersData: { users: ApiAccessUser[] } = await usersResp.json();
    const targetUser = usersData.users.find((u) => u.localLoginName === testLogin);
    expect(targetUser).toBeDefined();

    // Admin deletes the local credential for this user
    const delResp = await page.request.delete(`${API_URL}/access/users/${targetUser?.id}/local-credential`, {
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
    const hideResp = await page.request.post(`${API_URL}/access/users/${targetUser?.id}/hide`, {
      headers: {
        Cookie: `devlake_session=${adminAuth.token}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    expect(hideResp.status()).toBe(200);
    expect((await listAccessUsers(api)).find((u) => u.id === targetUser?.id)).toBeUndefined();
  });

  test('13. Privilege Boundary: Member role cannot access /access or invoke admin user management endpoints', async ({
    page,
    context,
    browser,
  }) => {
    // Admin creates member user
    await loginAsAdmin(context);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}member_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin, {
      displayName: `Member ${testLogin}`,
      role: /^Member$/,
    });
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // Member signs in and completes password change
    const memberContext = await browser.newContext({ baseURL: APP_URL });
    const memberPage = await memberContext.newPage();
    const memberLogin = new LoginPage(memberPage);
    const memberShell = new ShellPage(memberPage);
    await memberLogin.open();
    await memberLogin.signIn(testLogin, tempPass);
    await memberShell.waitUntilUrl(/.*\/change-password/);

    const memberPass = 'MemberPassword12345!';
    await memberShell.changePassword(memberPass);
    await memberShell.waitUntilPathLeaves('/change-password');

    // Member attempts to navigate to /access directly in browser
    await new SettingsUsersPage(memberPage).open();
    // Client router accessLoader redirects member away from /access
    await memberShell.waitUntilPathLeaves('/access', 5000);
    expect(memberPage.url()).not.toContain('/access');

    // Member attempts to call admin API POST /api/access/local-users directly
    const apiAttempt = await memberShell.sessionFetch<ApiMessage>('/api/access/local-users', {
      method: 'POST',
      body: { loginName: `${E2E_USER_PREFIX}hacked_admin`, role: 'customer_admin' },
    });
    expect(apiAttempt.status).toBe(403);
    expect(apiAttempt.body?.message).toMatch(/customer administrator access is required/i);

    await memberContext.close();
  });

  test('14. User Management Validation: duplicate username triggers error and client format guards', async ({
    page,
    context,
  }) => {
    await loginAsAdmin(context);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}dup_${Date.now()}`;
    const form = await usersPage.openAddLocalUser();

    // Client format validation: too short (<3 chars)
    await form.fillUsername('ab');
    await expect(form.formatError).toBeVisible();
    await expect(form.createButton).toBeDisabled();

    // Valid format: create the user
    await form.fillUsername(testLogin);
    await expect(form.createButton).toBeEnabled();
    const otpDialog = await form.create();

    await expect(otpDialog.dialog).toBeVisible();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // Now attempt to create user with the exact same username
    const dupForm = await usersPage.openAddLocalUser();
    await dupForm.fillUsername(testLogin);
    await dupForm.create();

    // Error message displayed and modal does not succeed
    await expect(dupForm.duplicateError).toBeVisible();
    await dupForm.cancel();
    expect(countLocalCredentials(testLogin)).toBe(1);
    expect((await listAccessUsers(api)).filter((u) => u.localLoginName === testLogin)).toHaveLength(1);
  });

  test('15. Grafana Identity Boundary: Local-only user navigating to /grafana-login receives independent login fallback', async ({
    page,
    context,
    browser,
  }) => {
    // Admin creates local user
    await loginAsAdmin(context);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}grafana_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin);
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // User completes first login
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPass);
    await userShell.waitUntilUrl(/.*\/change-password/);

    const userPass = 'GrafanaFallbackPass123!';
    await userShell.changePassword(userPass);
    await userShell.waitUntilPathLeaves('/change-password');

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
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    // Create a local user
    const testLogin = `${E2E_USER_PREFIX}sec_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin);
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

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
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}menu_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin);
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // 2. User completes first-time login and password change
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPass);
    await userShell.waitUntilUrl(/.*\/change-password/);

    const userPass = 'ValidLinkUser123!';
    await userShell.changePassword(userPass);
    await userShell.waitUntilPathLeaves('/change-password');

    // Verify user is in authenticated session
    await expect(userPage).not.toHaveURL(/.*\/login/);

    // 3. User clicks on the Account menu in the header
    // In layout.tsx: <Dropdown menu={{ items: accountMenuItems }} onOpenChange={loadLinkableProviders}>
    // <Button type="text" icon={<UserOutlined />}>{user.name || user.email || 'Account'}</Button>
    const userMenuName = new RegExp(testLogin, 'i');
    await expect(userShell.accountButton(userMenuName)).toBeVisible();

    // Open the menu and capture the /api/access/oidc-providers/linkable response
    const linkableResponse = await userShell.openAccountMenu(userMenuName);
    // Regression check: Status MUST be 200 OK, not 401 Unauthorized
    expect(linkableResponse.status).toBe(200);

    const linkableData = linkableResponse.body;
    expect(Array.isArray(linkableData)).toBe(true);
    // Enabled providers (e.g. google-one, auth0) should be returned
    const providerKeys = linkableData?.map((p) => p.providerKey);
    expect(providerKeys).toContain('google-one');

    // Regression check: Frontend global interceptor must NOT redirect user to /login
    await userShell.pause(2000);
    expect(userPage.url()).not.toContain('/login');

    // Menu options for linking should be visible
    await expect(userShell.addGoogleSignInItem).toBeVisible();
    await expect(userShell.signOutItem).toBeVisible();

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
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    const testLogin = `${E2E_USER_PREFIX}link_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin);
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    await expectLocalUser(testLogin);

    // 2. User completes first-time login
    const userContext = await browser.newContext({ baseURL: APP_URL });
    const userPage = await userContext.newPage();
    const userLogin = new LoginPage(userPage);
    const userShell = new ShellPage(userPage);
    await userLogin.open();
    await userLogin.signIn(testLogin, tempPass);
    await userShell.waitUntilUrl(/.*\/change-password/);

    const userPass = 'ValidLinkInit123!';
    await userShell.changePassword(userPass);
    await userShell.waitUntilPathLeaves('/change-password');

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
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();

    // Click Account dropdown
    const adminShell = new ShellPage(page);
    const adminMenuName = new RegExp(`Account|${process.env.E2E_ADMIN_NAME ?? 'Account'}`, 'i');
    await expect(adminShell.accountButton(adminMenuName)).toBeVisible();

    const linkableResponse = await adminShell.openAccountMenu(adminMenuName);
    expect(linkableResponse.status).toBe(200);
    const linkableData = linkableResponse.body;
    // All enabled providers are already linked for admin user 1, so linkable array is empty
    expect(Array.isArray(linkableData)).toBe(true);
    test.skip(
      (linkableData?.length ?? 0) > 0,
      'Admin identity has unlinked providers; this boundary needs an admin linked to every enabled provider',
    );
    expect(linkableData?.length).toBe(0);

    // UI shows "No additional sign-in providers" disabled menu item
    await expect(adminShell.noAdditionalProvidersItem).toBeVisible();
    await expect(adminShell.signOutItem).toBeVisible();

    // Verify session remains intact
    expect(page.url()).not.toContain('/login');
  });
});
