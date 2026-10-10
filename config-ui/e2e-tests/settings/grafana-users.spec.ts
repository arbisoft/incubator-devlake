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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { loginAsAdmin } from '../auth-helpers';
import { test } from '../fixtures';
import {
  adminApi,
  createEmailUser,
  createGrafanaCleanupRegistry,
  createGrafanaUser,
  createProject,
  deleteGrafanaAccountByEmail,
  grafanaPasswordLoginWorks,
  listGrafanaUsers,
  setGrafanaAdmin,
  uniqueName,
} from '../support/api';
import { GRAFANA_ROLE, GRAFANA_USERS_COPY, USER_MANAGEMENT_COPY, type GrafanaRole } from '../support/app-copy';
import { deleteEmailUsersNamedLike, readGrafanaProjectMappings } from '../support/db';
import { passwordMatches } from '../support/grafana-safety';
import { PATHS } from '../support/pages/paths';
import { GrafanaOneTimePasswordDialog, GrafanaUserFormDialog } from '../support/pages/settings-grafana-user-dialogs';
import { SettingsGrafanaUsersPage } from '../support/pages/settings-grafana-users';
import { SettingsUsersPage } from '../support/pages/settings-users';
import { ShellPage } from '../support/pages/shell';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Grafana user management ordinary flows', () => {
  let api: APIRequestContext;
  let cleanup: ReturnType<typeof createGrafanaCleanupRegistry>;
  let accessUserEmail: string | undefined;
  const previousCopyPromptSetting = process.env.PLAYWRIGHT_NO_COPY_PROMPT;
  const inMemoryPasswords = new Set<string>();
  const { disable, enable } = GRAFANA_USERS_COPY.confirm;

  const rememberPassword = (password: string): string => {
    inMemoryPasswords.add(password);
    return password;
  };

  test.beforeEach(async ({ playwright, context }) => {
    api = await adminApi(playwright);
    cleanup = createGrafanaCleanupRegistry(api, playwright);
    await loginAsAdmin(context);
  });

  test.afterEach(async () => {
    try {
      await cleanup?.cleanup();
    } finally {
      try {
        if (accessUserEmail) deleteEmailUsersNamedLike(accessUserEmail);
      } finally {
        await api?.dispose();
        accessUserEmail = undefined;
      }
    }
  });

  test.afterAll(() => {
    try {
      const goldenDirectory = join(__dirname, '..', 'goldens', 'settings', 'grafana-users');
      let leaked = false;
      if (existsSync(goldenDirectory)) {
        for (const entry of readdirSync(goldenDirectory, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
          const golden = readFileSync(join(goldenDirectory, entry.name), 'utf8');
          for (const password of inMemoryPasswords) leaked ||= golden.includes(password);
        }
      }
      expect(leaked).toBe(false);
    } finally {
      if (previousCopyPromptSetting === undefined) delete process.env.PLAYWRIGHT_NO_COPY_PROMPT;
      else process.env.PLAYWRIGHT_NO_COPY_PROMPT = previousCopyPromptSetting;
      inMemoryPasswords.clear();
    }
  });

  const trackUser = (email: string): void => cleanup.trackUser(email);

  const seedProject = async (name = uniqueName('project')): Promise<string> => {
    cleanup.trackProject(name);
    await createProject(api, name);
    return name;
  };

  const seedUser = async (
    email = `${uniqueName('user')}@example.com`,
    options: { name?: string; role?: GrafanaRole; projects?: string[] } = {},
  ) => {
    trackUser(email);
    const password = rememberPassword(`${uniqueName('pw')}-Aa9!`);
    return createGrafanaUser(api, {
      email,
      name: options.name ?? 'Grafana test user',
      role: options.role ?? GRAFANA_ROLE.VIEWER,
      projectNames: options.projects ?? [],
      password,
    });
  };

  const visibleUser = async (email: string) =>
    (await listGrafanaUsers(api, { query: email })).users.find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );

  test.beforeAll(() => {
    process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
  });

  const openAddUserForm = async (page: Page) => {
    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    return { users, form: await users.openAddUser() };
  };

  const openTemplateForm = async (page: Page, email: string, displayName: string | undefined) => {
    const { form } = await openAddUserForm(page);
    await form.selectDevlakeUser(email, displayName ? `${displayName} (${email})` : email);
    return form;
  };

  const prepareTemplateWithEditor = async (form: GrafanaUserFormDialog, project: string): Promise<void> => {
    await form.selectRole(GRAFANA_ROLE.EDITOR);
    await form.searchAndSelectProject(project);
    await form.generatePassword();
  };

  const editedTemplateState = async (
    form: GrafanaUserFormDialog,
    identityLabel: string,
    identityValue: string,
    password: string,
    project: string,
  ) => ({
    identityPreserved: (await form.field(identityLabel).inputValue()) === identityValue,
    pickerCleared: (await form.devlakeUserPicker.inputValue()) === '',
    passwordPreserved: (await form.field(GRAFANA_USERS_COPY.password.label).inputValue()) === password,
    rolePreserved: (await form.selectedRole()) === GRAFANA_ROLE.EDITOR,
    projectPreserved: (await form.selectedProjects()).includes(project),
  });

  const templatePasswordOutcome = async (page: Page, email: string, password: string) => {
    const oneTime = new GrafanaOneTimePasswordDialog(page, email);
    const visible = await oneTime.waitUntilVisible();
    const passwordCheck = await oneTime.readAndClose(password, rememberPassword);
    return { visible, ...passwordCheck };
  };

  test('switches between the DevLake and Grafana tabs and keeps the Grafana route on reload', async ({ page }) => {
    const grafana = new SettingsGrafanaUsersPage(page);
    await grafana.open();
    await expect(page).toHaveURL(grafana.urlPattern);
    await expect(grafana.ready).toBeVisible();
    await expect(grafana.breadcrumb).toContainText(USER_MANAGEMENT_COPY.breadcrumbViews.grafana);
    const shell = new ShellPage(page);
    await expect(shell.selectedNavItem).toHaveText(shell.navLabels.users);

    await grafana.openTab('DevLake');
    const devlake = new SettingsUsersPage(page);
    await expect(page).toHaveURL(PATHS.settingsUsers);
    await expect(devlake.ready).toBeVisible();
    await expect(shell.selectedNavItem).toHaveText(shell.navLabels.users);

    await grafana.openTab('Grafana');
    await expect(page).toHaveURL(grafana.urlPattern);
    await grafana.reloadAndWait();
    await expect(grafana.grafanaTab).toBeChecked();
  });

  test('searches, updates the count, pages through results, and keeps the search after reload', async ({ page }) => {
    const query = uniqueName('page');
    const emails = Array.from({ length: 11 }, (_, index) => `${query}-${String(index).padStart(2, '0')}@example.com`);
    for (const email of emails) await seedUser(email);

    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    await users.search(query);
    await expect.poll(() => users.urlParams.get('keyword')).toBe(query);
    await expect.poll(() => users.visibleUserCount()).toBe(10);
    await expect(users.resultCount).toHaveText('11');
    await users.goToPage(2);
    await expect.poll(() => users.visibleUserCount()).toBe(1);
    await expect.poll(() => users.currentPage.getAttribute('title')).toBe('2');
    await users.reloadAndWait();
    await expect.poll(() => users.urlParams.get('keyword')).toBe(query);
    await expect.poll(() => users.visibleUserCount()).toBe(1);

    const noMatch = `${query}-no-such-account`;
    await users.search(noMatch);
    await expect.poll(() => users.urlParams.get('keyword')).toBe(noMatch);
    await expect(users.noResults).toBeVisible();
    await expect(users.resultCount).toHaveText('0');
  });

  test('creates a typed user with a generated password, role and projects', async ({ page, playwright }) => {
    const email = `${uniqueName('typed')}@Example.COM`;
    const normalizedEmail = email.toLowerCase();
    const name = 'Typed Grafana User';
    const firstProject = await seedProject();
    const secondProject = await seedProject();
    trackUser(normalizedEmail);

    const { form } = await openAddUserForm(page);
    await form.fillField(GRAFANA_USERS_COPY.add.email.label, email);
    await form.fillField(GRAFANA_USERS_COPY.add.name.label, name);
    await form.selectRole(GRAFANA_ROLE.EDITOR);
    await form.searchAndSelectProject(firstProject);
    await form.searchAndSelectProject(secondProject);
    await form.generatePassword();
    const password = rememberPassword(await form.field(GRAFANA_USERS_COPY.password.label).inputValue());
    await form.submit();

    const oneTime = new GrafanaOneTimePasswordDialog(page, normalizedEmail);
    await expect.poll(() => oneTime.isVisible()).toBe(true);
    const shownPassword = rememberPassword(await oneTime.readPassword());
    expect(shownPassword.length).toBeGreaterThanOrEqual(15);
    expect(passwordMatches(shownPassword, password)).toBe(true);
    expect(await oneTime.copyMatches(shownPassword)).toBe(true);
    expect(await grafanaPasswordLoginWorks(playwright, normalizedEmail, password)).toBe(true);
    await oneTime.close();
    await expect.poll(() => oneTime.isVisible()).toBe(false);

    await expect
      .poll(() => visibleUser(normalizedEmail))
      .toMatchObject({
        email: normalizedEmail,
        name,
        role: GRAFANA_ROLE.EDITOR,
        projects: [firstProject, secondProject].sort(),
      });
    expect(readGrafanaProjectMappings(normalizedEmail).sort()).toEqual([firstProject, secondProject].sort());
  });

  test('uses a DevLake user as a template, then clear restores every default field', async ({ page }) => {
    const prefix = uniqueName('template-clear');
    const sourceEmail = `${prefix}@example.com`;
    accessUserEmail = sourceEmail;
    const source = await createEmailUser(api, sourceEmail);
    const project = await seedProject();
    const grafanaEmail = `${uniqueName('picked')}@example.com`;
    trackUser(grafanaEmail);

    const form = await openTemplateForm(page, sourceEmail, source.displayName);
    await expect.poll(() => form.fieldValue(GRAFANA_USERS_COPY.add.email.label)).toBe(sourceEmail);
    await expect.poll(() => form.fieldValue(GRAFANA_USERS_COPY.add.name.label)).toBe(source.displayName);
    await form.selectRole(GRAFANA_ROLE.ADMIN);
    await form.searchAndSelectProject(project);
    await form.generatePassword();
    rememberPassword(await form.field(GRAFANA_USERS_COPY.password.label).inputValue());
    await form.clearDevlakeUser();

    await expect.poll(() => form.fieldValue(GRAFANA_USERS_COPY.add.email.label)).toBe('');
    await expect.poll(() => form.fieldValue(GRAFANA_USERS_COPY.add.name.label)).toBe('');
    await expect.poll(() => form.passwordIsEmpty()).toBe(true);
    expect(await form.selectedRole()).toBe(GRAFANA_ROLE.VIEWER);
    expect(await form.selectedProjects()).toEqual([]);

    await form.fillField(GRAFANA_USERS_COPY.add.email.label, grafanaEmail);
    await form.fillField(GRAFANA_USERS_COPY.add.name.label, 'Cleared Template User');
    const password = rememberPassword(`${uniqueName('clear-pw')}-Aa9!`);
    await form.fillPassword(password);
    await form.submit();
    const oneTime = new GrafanaOneTimePasswordDialog(page, grafanaEmail);
    await expect.poll(() => oneTime.isVisible()).toBe(true);
    const passwordCheck = await oneTime.readAndClose(password, rememberPassword);
    expect(passwordCheck.matches).toBe(true);
    expect(passwordCheck.copied).toBe(true);
    await expect
      .poll(() => visibleUser(grafanaEmail))
      .toMatchObject({
        email: grafanaEmail,
        name: 'Cleared Template User',
        role: GRAFANA_ROLE.VIEWER,
        projects: [],
      });
  });

  test('editing the template email clears the selection and preserves the other fields', async ({
    page,
    playwright,
  }) => {
    const prefix = uniqueName('template-email');
    const sourceEmail = `${prefix}@example.com`;
    accessUserEmail = sourceEmail;
    const source = await createEmailUser(api, sourceEmail);
    const project = await seedProject();
    const changedEmail = `${uniqueName('manual-email')}@example.com`;
    trackUser(changedEmail);

    const form = await openTemplateForm(page, sourceEmail, source.displayName);
    await prepareTemplateWithEditor(form, project);
    const password = rememberPassword(await form.field(GRAFANA_USERS_COPY.password.label).inputValue());
    await form.fillField(GRAFANA_USERS_COPY.add.email.label, changedEmail);

    expect(
      await editedTemplateState(form, GRAFANA_USERS_COPY.add.name.label, source.displayName, password, project),
    ).toEqual({
      identityPreserved: true,
      pickerCleared: true,
      passwordPreserved: true,
      rolePreserved: true,
      projectPreserved: true,
    });

    const name = 'Completed template account';
    await form.fillField(GRAFANA_USERS_COPY.add.name.label, name);
    await form.submit();
    expect(await templatePasswordOutcome(page, changedEmail, password)).toEqual({
      visible: true,
      matches: true,
      copied: true,
    });
    expect(await grafanaPasswordLoginWorks(playwright, changedEmail, password)).toBe(true);
    await expect
      .poll(() => visibleUser(changedEmail))
      .toMatchObject({
        email: changedEmail,
        name,
        role: GRAFANA_ROLE.EDITOR,
        projects: [project],
      });
  });

  test('editing the template name clears the selection and preserves the other fields', async ({
    page,
    playwright,
  }) => {
    const prefix = uniqueName('template-name');
    const sourceEmail = `${prefix}@example.com`;
    accessUserEmail = sourceEmail;
    const source = await createEmailUser(api, sourceEmail);
    const project = await seedProject();
    trackUser(sourceEmail);

    const form = await openTemplateForm(page, sourceEmail, source.displayName);
    await prepareTemplateWithEditor(form, project);
    const password = rememberPassword(await form.field(GRAFANA_USERS_COPY.password.label).inputValue());
    const name = 'Manually edited template name';
    await form.fillField(GRAFANA_USERS_COPY.add.name.label, name);

    expect(await editedTemplateState(form, GRAFANA_USERS_COPY.add.email.label, sourceEmail, password, project)).toEqual(
      {
        identityPreserved: true,
        pickerCleared: true,
        passwordPreserved: true,
        rolePreserved: true,
        projectPreserved: true,
      },
    );

    await form.submit();
    expect(await templatePasswordOutcome(page, sourceEmail, password)).toEqual({
      visible: true,
      matches: true,
      copied: true,
    });
    expect(await grafanaPasswordLoginWorks(playwright, sourceEmail, password)).toBe(true);
    await expect
      .poll(() => visibleUser(sourceEmail))
      .toMatchObject({
        email: sourceEmail,
        name,
        role: GRAFANA_ROLE.EDITOR,
        projects: [project],
      });
  });

  test('shows duplicate email errors and blocks a 14-character password inline', async ({ page }) => {
    const email = `${uniqueName('duplicate')}@example.com`;
    await seedUser(email);

    const { users, form } = await openAddUserForm(page);
    await form.fillField(GRAFANA_USERS_COPY.add.email.label, email);
    await form.fillField(GRAFANA_USERS_COPY.add.name.label, 'Duplicate Account');
    await form.fillPassword(rememberPassword(`${uniqueName('duplicate-pw')}-Aa9!`));
    await form.submit();
    await expect.poll(() => users.userExistsErrorIsVisible()).toBe(true);
    await expect.poll(() => form.fieldValue(GRAFANA_USERS_COPY.add.email.label)).toBe(email);
    await expect.poll(() => form.fieldValue(GRAFANA_USERS_COPY.add.name.label)).toBe('Duplicate Account');

    await form.fillPassword(rememberPassword('Abcdefghijk12!'));
    await expect.poll(() => form.submitIsDisabled()).toBe(true);
    const matches = await listGrafanaUsers(api, { query: email });
    expect(matches.users.filter((user) => user.email.toLowerCase() === email.toLowerCase())).toHaveLength(1);
  });

  test('changes the inline role from Viewer to Admin and back', async ({ page }) => {
    const email = `${uniqueName('role')}@example.com`;
    const seeded = await seedUser(email);
    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    await (await users.openUser(email)).chooseRole(GRAFANA_ROLE.ADMIN);
    await expect.poll(() => visibleUser(email)).toMatchObject({ id: seeded.id, role: GRAFANA_ROLE.ADMIN });
    await (await users.openUser(email)).chooseRole(GRAFANA_ROLE.VIEWER);
    await expect.poll(() => visibleUser(email)).toMatchObject({ id: seeded.id, role: GRAFANA_ROLE.VIEWER });
  });

  test('disables and re-enables an account with a named confirmation', async ({ page, playwright }) => {
    const email = `${uniqueName('status')}@example.com`;
    const password = rememberPassword(`${uniqueName('status-pw')}-Aa9!`);
    trackUser(email);
    const seeded = await createGrafanaUser(api, {
      email,
      name: 'Status test user',
      role: GRAFANA_ROLE.VIEWER,
      projectNames: [],
      password,
    });
    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    const row = await users.openUser(email);
    await row.requestDisable();
    await expect(users.confirmationDialog(disable.title(email))).toBeVisible();
    await users.confirmAction(disable.title(email), disable.confirm);
    await expect.poll(() => visibleUser(email)).toMatchObject({ id: seeded.id, disabled: true });
    expect(await grafanaPasswordLoginWorks(playwright, email, password)).toBe(false);

    await (await users.openUser(email)).requestEnable();
    await users.confirmAction(enable.title(email), enable.confirm);
    await expect.poll(() => visibleUser(email)).toMatchObject({ id: seeded.id, disabled: false });
    expect(await grafanaPasswordLoginWorks(playwright, email, password)).toBe(true);
  });

  test('edits a name then confirms an email change and moves dashboard mappings', async ({ page, playwright }) => {
    const email = `${uniqueName('details')}@example.com`;
    const newEmail = `${uniqueName('details-new')}@example.com`;
    const project = await seedProject();
    trackUser(email);
    trackUser(newEmail);
    const password = rememberPassword(`${uniqueName('details-pw')}-Aa9!`);
    const seeded = await createGrafanaUser(api, {
      email,
      name: 'Original name',
      role: GRAFANA_ROLE.VIEWER,
      projectNames: [project],
      password,
    });

    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    let form = await users.openDetails(email);
    await form.fillField(GRAFANA_USERS_COPY.add.name.label, 'Updated name');
    await form.submit();
    await expect.poll(() => visibleUser(email)).toMatchObject({ id: seeded.id, name: 'Updated name' });

    form = await users.openDetails(email);
    await form.fillField(GRAFANA_USERS_COPY.add.email.label, newEmail);
    await form.submit();
    await users.confirmEmailChange();
    await expect
      .poll(() => visibleUser(newEmail))
      .toMatchObject({
        id: seeded.id,
        email: newEmail,
        name: 'Updated name',
        projects: [project],
      });
    await expect.poll(() => visibleUser(email)).toBeUndefined();
    expect(readGrafanaProjectMappings(newEmail)).toEqual([project]);
    expect(readGrafanaProjectMappings(email)).toEqual([]);
    expect(await grafanaPasswordLoginWorks(playwright, newEmail, password)).toBe(true);
  });

  test('adds, removes and clears project access through the Projects dialog', async ({ page }) => {
    const email = `${uniqueName('projects')}@example.com`;
    const first = await seedProject();
    const second = await seedProject();
    const seeded = await seedUser(email);
    const users = new SettingsGrafanaUsersPage(page);
    await users.open();

    let dialog = await users.openProjects(email);
    await dialog.searchAndSelectProject(first);
    await dialog.submit();
    await expect.poll(() => readGrafanaProjectMappings(email)).toEqual([first]);
    await expect
      .poll(() => listGrafanaUsers(api, { query: email }))
      .toMatchObject({
        users: [{ id: seeded.id, projects: [first] }],
      });

    dialog = await users.openProjects(email);
    await dialog.searchAndSelectProject(second);
    await dialog.searchAndSelectProject(first);
    await dialog.submit();
    await expect.poll(() => readGrafanaProjectMappings(email)).toEqual([second]);
    await expect.poll(() => visibleUser(email)).toMatchObject({ projects: [second] });

    dialog = await users.openProjects(email);
    await dialog.searchAndSelectProject(second);
    await dialog.submit();
    await expect.poll(() => readGrafanaProjectMappings(email)).toEqual([]);
    await expect.poll(() => visibleUser(email)).toMatchObject({ projects: [] });
  });

  test('sets a new password and verifies the old and new credentials', async ({ page, playwright }) => {
    const email = `${uniqueName('password')}@example.com`;
    const oldPassword = rememberPassword(`${uniqueName('old-pw')}-Aa9!`);
    trackUser(email);
    const seeded = await createGrafanaUser(api, {
      email,
      name: 'Password test user',
      role: GRAFANA_ROLE.VIEWER,
      projectNames: [],
      password: oldPassword,
    });

    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    const form = await users.openSetPassword(email);
    await form.generatePassword();
    const newPassword = rememberPassword(await form.field(GRAFANA_USERS_COPY.password.label).inputValue());
    await form.submit();
    const oneTime = new GrafanaOneTimePasswordDialog(page, email);
    await expect.poll(() => oneTime.isVisible()).toBe(true);
    const revealed = rememberPassword(await oneTime.readPassword());
    expect(revealed.length).toBeGreaterThanOrEqual(15);
    expect(passwordMatches(revealed, newPassword)).toBe(true);
    expect(await oneTime.copyMatches(revealed)).toBe(true);
    await oneTime.close();
    await expect.poll(() => visibleUser(email)).toMatchObject({ id: seeded.id });
    expect(await grafanaPasswordLoginWorks(playwright, email, oldPassword)).toBe(false);
    expect(await grafanaPasswordLoginWorks(playwright, email, newPassword)).toBe(true);
  });

  test('deletes an account after a confirmation naming the user', async ({ page }) => {
    const email = `${uniqueName('delete')}@example.com`;
    const project = await seedProject();
    await seedUser(email, { projects: [project] });
    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    await (await users.openUser(email)).requestDelete();
    const confirm = GRAFANA_USERS_COPY.confirm.delete;
    await expect(users.confirmationDialog(confirm.title(email))).toBeVisible();
    await users.confirmAction(confirm.title(email), confirm.confirm);
    await expect.poll(() => visibleUser(email)).toBeUndefined();
    expect(readGrafanaProjectMappings(email)).toEqual([]);
  });

  test('keeps protected controls locked and verifies project changes on an e2e server admin', async ({
    page,
    playwright,
  }) => {
    const email = `${uniqueName('protected')}@example.com`;
    const project = await seedProject();
    const realAdmin = (await listGrafanaUsers(api, { query: 'admin' })).users.find(
      (user) => user.protected && !user.email.toLowerCase().startsWith('e2e-'),
    );
    expect(realAdmin).toBeDefined();
    if (!realAdmin) throw new Error('The protected Grafana admin fixture was unavailable.');
    cleanup.trackGrafanaAdmin(email);
    trackUser(email);
    const seeded = await createGrafanaUser(api, {
      email,
      name: 'Protected test admin',
      role: GRAFANA_ROLE.ADMIN,
      projectNames: [],
      password: rememberPassword(`${uniqueName('protected-pw')}-Aa9!`),
    });
    await setGrafanaAdmin(playwright, email, true);

    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    const realAdminRow = await users.openUser(realAdmin.email);
    await expect(realAdminRow.roleSelect).toBeDisabled();
    await expect(realAdminRow.disableButton).toHaveCount(0);
    await expect(realAdminRow.deleteButton).toHaveCount(0);
    await expect(realAdminRow.moreActionsButton).toHaveCount(0);

    const row = await users.openUser(email);
    await expect.poll(() => visibleUser(email)).toMatchObject({ id: seeded.id, protected: true });
    await expect(row.roleSelect).toBeDisabled();
    await expect(row.disableButton).toHaveCount(0);
    await expect(row.enableButton).toHaveCount(0);
    await expect(row.deleteButton).toHaveCount(0);
    await expect(row.moreActionsButton).toHaveCount(0);

    let dialog = await users.openProjects(email);
    await dialog.searchAndSelectProject(project);
    await dialog.submit();
    await expect.poll(() => readGrafanaProjectMappings(email)).toEqual([project]);
    dialog = await users.openProjects(email);
    await dialog.searchAndSelectProject(project);
    await dialog.submit();
    await expect.poll(() => readGrafanaProjectMappings(email)).toEqual([]);
  });

  test('reviews and clears an orphan mapping after the Grafana account is removed', async ({ page, playwright }) => {
    const email = `${uniqueName('orphan')}@example.com`;
    const project = await seedProject();
    const originalOrphans = (await listGrafanaUsers(api)).orphans;
    await seedUser(email, { projects: [project] });
    cleanup.trackOrphan(email);
    await deleteGrafanaAccountByEmail(playwright, email);
    const expectedOrphans = [...originalOrphans, { account: email, projects: [project] }].sort((left, right) =>
      left.account.localeCompare(right.account),
    );

    const users = new SettingsGrafanaUsersPage(page);
    await users.open();
    await expect(users.orphanNotice(expectedOrphans.length)).toBeVisible();
    const dialog = await users.openOrphans();
    await expect(dialog.account(email)).toBeVisible();
    await expect(dialog.project(project)).toBeVisible();
    await dialog.clear(email);
    await users.confirmOrphanClear(email);
    await expect.poll(() => readGrafanaProjectMappings(email)).toEqual([]);
    await expect.poll(() => listGrafanaUsers(api)).toMatchObject({ orphans: originalOrphans });
    if (originalOrphans.length === 0) await expect(users.orphanNotice(0)).toBeHidden();
    else await expect(users.orphanNotice(originalOrphans.length)).toBeVisible();
    await expect.poll(() => visibleUser(email)).toBeUndefined();
  });
});
