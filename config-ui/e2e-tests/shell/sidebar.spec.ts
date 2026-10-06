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
import { adminApi, createProject, deleteProject, findAccessUserByLogin, uniqueName } from '../support/api';
import { fetchAuthMethods } from '../support/auth-state';
import { resetLocalAuthState } from '../support/db';
import { APP_URL, E2E_USER_PREFIX } from '../support/env';
import { LoginPage } from '../support/pages/login';
import { PATHS } from '../support/pages/paths';
import { PipelinesPage } from '../support/pages/pipelines';
import { ProjectsPage } from '../support/pages/projects';
import { SettingsUsersPage } from '../support/pages/settings-users';
import { ShellPage } from '../support/pages/shell';

test.describe('sidebar', () => {
  let api: APIRequestContext;
  let blueprintId: number;
  const projectName = uniqueName('proj-sidebar');

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    const project = await createProject(api, projectName);
    blueprintId = (project.blueprint as { id: number }).id;
  });

  test.afterAll(async () => {
    await deleteProject(api, projectName);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('collapses to the rail and expands again', async ({ page, browserErrors }) => {
    const shell = new ShellPage(page);
    const projects = new ProjectsPage(page);
    await projects.open();
    await expect(projects.ready).toBeVisible();
    await expect(shell.collapseToggle).toBeVisible();
    await expect(shell.expandToggle).toBeHidden();

    await shell.collapseSidebar();
    await expect(shell.expandToggle).toBeVisible();
    await expect(shell.collapseToggle).toBeHidden();
    expect(await shell.readStoredSidebarCollapsed()).toBe('true');

    await shell.expandSidebar();
    await expect(shell.collapseToggle).toBeVisible();
    expect(await shell.readStoredSidebarCollapsed()).toBe('false');
    expect(browserErrors).toEqual([]);
  });

  test('the collapsed state persists across a reload', async ({ page, browserErrors }) => {
    const shell = new ShellPage(page);
    const projects = new ProjectsPage(page);
    await projects.open();
    await shell.collapseSidebar();
    await shell.reload();
    await expect(projects.ready).toBeVisible();
    await expect(shell.expandToggle).toBeVisible();
    expect(await shell.readStoredSidebarCollapsed()).toBe('true');

    await shell.expandSidebar();
    await shell.reload();
    await expect(projects.ready).toBeVisible();
    await expect(shell.collapseToggle).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test('a collapsed group opens a click flyout and Esc closes it', async ({ page, browserErrors }) => {
    const shell = new ShellPage(page);
    const projects = new ProjectsPage(page);
    await projects.open();
    await shell.collapseSidebar();

    await shell.openFlyout(shell.navLabels.advanced);
    await expect(shell.flyoutItem(shell.navLabels.blueprints)).toBeVisible();
    await expect(shell.flyoutItem(shell.navLabels.pipelines)).toBeVisible();

    await shell.closeFlyout();
    await expect(shell.flyout).toBeHidden();

    await shell.openFlyout(shell.navLabels.advanced);
    await shell.openFlyoutItem(shell.navLabels.pipelines);
    await expect(page).toHaveURL(new PipelinesPage(page).urlPattern);
    expect(browserErrors).toEqual([]);
  });

  test('the active item follows the route, and a nested url highlights its parent item', async ({
    page,
    browserErrors,
  }) => {
    const shell = new ShellPage(page);
    await shell.visit(PATHS.projectTab(projectName, 'settings'));
    await expect(shell.selectedNavItem).toHaveText(shell.navLabels.projects);

    await shell.visit(PATHS.blueprint(blueprintId));
    await expect(shell.selectedNavItem).toHaveText(shell.navLabels.blueprints);

    await shell.visit(PATHS.pipelines);
    await expect(shell.selectedNavItem).toHaveText(shell.navLabels.pipelines);

    await shell.visit(PATHS.keys);
    await expect(shell.selectedNavItem).toHaveText(shell.navLabels.apiKeys);

    await shell.visit(PATHS.settingsUsers);
    await expect(shell.selectedNavItem).toHaveText(shell.navLabels.users);
    expect(browserErrors).toEqual([]);
  });

  test('Resources and Dashboards open in a new tab', async ({ page, browserErrors }) => {
    const shell = new ShellPage(page);
    const projects = new ProjectsPage(page);
    await projects.open();
    await expect(projects.ready).toBeVisible();
    await shell.openNavItem(shell.navLabels.resources);

    for (const label of [shell.navLabels.docs, shell.navLabels.api]) {
      await expect(shell.navLink(label)).toHaveAttribute('target', '_blank');
      const opened = await shell.openNavItemInNewTab(label);
      expect(opened).not.toBe(page);
      await opened.close();
      await expect(page).toHaveURL(projects.urlPattern);
    }

    await expect(shell.dashboardsLink).toHaveAttribute('target', '_blank');
    const dashboards = await shell.openNavItemInNewTab(shell.navLabels.dashboards);
    expect(dashboards).not.toBe(page);
    await dashboards.close();
    await expect(page).toHaveURL(projects.urlPattern);
    expect(browserErrors).toEqual([]);
  });

  test('Settings is shown to an admin and hidden from a member', async ({ page, browser, request }) => {
    const methods = await fetchAuthMethods(request);
    test.skip(!methods.localPassword?.enabled, 'Local password authentication is disabled (auth state B is required)');
    resetLocalAuthState();

    const adminShell = new ShellPage(page);
    const usersPage = new SettingsUsersPage(page);
    await usersPage.open();
    await expect(adminShell.navItemByLabel(adminShell.navLabels.settings)).toBeVisible();

    const testLogin = `${E2E_USER_PREFIX}sidebar_${Date.now()}`;
    const otpDialog = await usersPage.createLocalUser(testLogin, { role: /^Member$/ });
    const tempPass = await otpDialog.readPassword();
    await otpDialog.done();
    expect(await findAccessUserByLogin(api, testLogin)).toMatchObject({ role: 'member', status: 'active' });

    const memberContext = await browser.newContext({ baseURL: APP_URL });
    const memberPage = await memberContext.newPage();
    const memberShell = new ShellPage(memberPage);
    await new LoginPage(memberPage).open();
    await new LoginPage(memberPage).signIn(testLogin, tempPass);
    await memberShell.waitUntilUrl(/.*\/change-password/);
    await memberShell.changePassword('SidebarMember12345!');
    await memberShell.waitUntilPathLeaves('/change-password');

    await expect(memberShell.navItemByLabel(memberShell.navLabels.projects)).toBeVisible();
    await expect(memberShell.navItemByLabel(memberShell.navLabels.settings)).toHaveCount(0);
    await expect(memberShell.usersMenuItem).toHaveCount(0);

    await memberContext.close();
    resetLocalAuthState();
  });
});
