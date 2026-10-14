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
import {
  adminApi,
  createOtelConnection,
  createProject,
  createWebhook,
  deleteBlueprint,
  deleteProject,
  deleteWebhooksByPrefix,
  findOtelConnection,
  getProject,
  retireOtelConnections,
  uniqueName,
  type ApiBlueprint,
} from '../support/api';
import { PROJECT_DETAIL_COPY as COPY } from '../support/app-copy';
import { deleteOtelConnectionsOfTeam } from '../support/db';
import { PATHS } from '../support/pages/paths';
import { ProjectPage, ProjectsPage } from '../support/pages/projects';

const SETTINGS = COPY.settings;

// The URLs of every tab, the redirects and the blueprint views are covered by shell/redirects and advanced/blueprint-detail.
test.describe.serial('project tabs', () => {
  let api: APIRequestContext;
  const plain = uniqueName('tabs-plain');
  const solo = uniqueName('tabs-solo');
  const shared = uniqueName('tabs-shared');
  const kept = uniqueName('tabs-kept');
  const bare = uniqueName('tabs-bare');
  const soloTeam = uniqueName('tabs-solo-team');
  const sharedTeam = uniqueName('tabs-shared-team');

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    for (const name of [plain, solo, shared, kept, bare]) {
      await createProject(api, name);
    }
    await createOtelConnection(api, soloTeam, [solo]);
    await createOtelConnection(api, sharedTeam, [shared, kept]);
  });

  test.afterAll(async () => {
    await retireOtelConnections(api, soloTeam);
    await retireOtelConnections(api, sharedTeam);
    deleteOtelConnectionsOfTeam(soloTeam);
    deleteOtelConnectionsOfTeam(sharedTeam);
    for (const name of [plain, solo, shared, kept, bare]) {
      await deleteProject(api, name);
    }
    await deleteWebhooksByPrefix(api);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('each tab shows its own panel after a direct load and after a reload', async ({ page, browserErrors }) => {
    const projectPage = new ProjectPage(page, plain);
    for (const tab of projectPage.tabs) {
      await projectPage.openAtTab(tab);
      await expect(projectPage.tabPanel(tab)).toBeVisible();

      await projectPage.reload();
      await expect(page).toHaveURL(projectPage.tabUrlPattern(tab));
      await expect(projectPage.tabPanel(tab)).toBeVisible();
    }
    expect(browserErrors).toEqual([]);
  });

  test('the Claude Code OTel tab lists a placement and hands over to the OTel page', async ({ page }) => {
    const projectPage = new ProjectPage(page, solo);
    await projectPage.openAtTab('claude-code-otel');
    const row = projectPage.otel.row(soloTeam);
    await expect(row).toBeVisible();
    await expect(row).toContainText(COPY.otel.projectOnly);

    await projectPage.otel.manage(soloTeam);
    await expect(page).toHaveURL(new RegExp(`${PATHS.otel}$`));

    await projectPage.openAtTab('claude-code-otel');
    await projectPage.otel.add();
    await expect(page).toHaveURL(new RegExp(`${PATHS.otel}\\?project=${encodeURIComponent(solo)}&create=true$`));
  });

  test('the Claude Code OTel tab says so when nothing is linked', async ({ page }) => {
    const projectPage = new ProjectPage(page, plain);
    await projectPage.openAtTab('claude-code-otel');
    await expect(projectPage.otel.empty).toBeVisible();
    await expect(projectPage.otel.addButton).toBeEnabled();
  });

  test('DORA, the pull request linker and issue trace are saved and survive a reload', async ({ page }) => {
    const projectPage = new ProjectPage(page, plain);
    await projectPage.openAtTab('settings');
    await expect(projectPage.settings.dora).toBeChecked();
    await expect(projectPage.settings.linkerRegexp).toBeHidden();

    await projectPage.settings.dora.uncheck();
    await projectPage.settings.linker.check();
    await projectPage.settings.fillLinkerRegexp('(?mi)(Fixes)\\s+#\\d+');
    await projectPage.settings.issueTrace.check();
    await projectPage.settings.save();
    await expect(projectPage.toast(SETTINGS.saved)).toBeVisible();

    await expect
      .poll(async () =>
        Object.fromEntries(
          ((await getProject(api, plain))?.metrics ?? []).map(({ pluginName, enable }) => [pluginName, enable]),
        ),
      )
      .toEqual({ dora: false, linker: true, issue_trace: true });
    const linker = (await getProject(api, plain))?.metrics?.find(({ pluginName }) => pluginName === 'linker');
    expect(linker?.pluginOption.prToIssueRegexp).toBe('(?mi)(Fixes)\\s+#\\d+');

    await projectPage.reload();
    await expect(projectPage.settings.dora).not.toBeChecked();
    await expect(projectPage.settings.linker).toBeChecked();
    await expect(projectPage.settings.linkerRegexp).toHaveValue('(?mi)(Fixes)\\s+#\\d+');
    await expect(projectPage.settings.issueTrace).toBeChecked();
  });

  test('discard puts the saved values back', async ({ page }) => {
    const projectPage = new ProjectPage(page, plain);
    await projectPage.openAtTab('settings');
    await expect(projectPage.settings.discardButton).toBeDisabled();
    await projectPage.settings.issueTrace.uncheck();
    await expect(projectPage.settings.discardButton).toBeEnabled();
    await projectPage.settings.discard();
    await expect(projectPage.settings.issueTrace).toBeChecked();
  });

  test('an existing webhook is attached to the project blueprint once', async ({ page }) => {
    const webhook = await createWebhook(api, uniqueName('webhook'));
    const projectPage = new ProjectPage(page, plain);
    await projectPage.openAtTab('webhooks');
    await projectPage.webhooks.selectExisting(webhook.name);

    await expect(projectPage.webhooks.row(webhook.name)).toBeVisible();
    await expect(projectPage.webhooks.selectDialog).toBeHidden();
    const { connections } = (await getProject(api, plain))?.blueprint as ApiBlueprint;
    expect(
      connections.filter((item) => item.pluginName === 'webhook' && item.connectionId === webhook.id),
    ).toHaveLength(1);
  });

  test('deleting is blocked while the project is the last placement of an active connection', async ({ page }) => {
    const projectPage = new ProjectPage(page, solo);
    await projectPage.openAtTab('settings');
    await expect(projectPage.settings.deleteButton).toBeEnabled();
    await projectPage.settings.openDeleteDialog();

    await expect(projectPage.settings.deleteDialog).toContainText(SETTINGS.delete.otelFinalActive);
    await expect(projectPage.settings.deleteConfirm).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(projectPage.settings.deleteDialog).toBeHidden();
    await expect(projectPage.settings.deleteButton).toBeFocused();
    expect(await getProject(api, solo)).toBeDefined();
  });

  test('deleting a project removes its placement and leaves the shared connection to the others', async ({ page }) => {
    const projectPage = new ProjectPage(page, shared);
    await projectPage.openAtTab('settings');
    await projectPage.settings.openDeleteDialog();
    await expect(projectPage.settings.deleteDialog).toContainText(SETTINGS.delete.otelRemoved);
    await projectPage.settings.confirmDelete();

    await expect(page).toHaveURL(new ProjectsPage(page).urlPattern);
    expect(await getProject(api, shared)).toBeUndefined();
    expect((await findOtelConnection(api, sharedTeam))?.projects).toEqual([{ name: kept }]);
  });

  test('a project without a blueprint shows an empty Blueprint tab and keeps the other tabs working', async ({
    page,
    browserErrors,
  }) => {
    const blueprint = (await getProject(api, bare))?.blueprint as ApiBlueprint;
    await deleteBlueprint(api, blueprint.id);
    expect((await getProject(api, bare))?.blueprint ?? null).toBeNull();

    const projectPage = new ProjectPage(page, bare);
    await projectPage.open();
    await expect(projectPage.noBlueprintHeading).toBeVisible();
    await expect(projectPage.tabFor('blueprint')).toHaveAttribute('aria-selected', 'true');

    await projectPage.openTab(COPY.tabs.webhooks);
    await expect(projectPage.tabPanel('webhooks')).toBeVisible();
    await expect(projectPage.webhooks.addButton).toBeDisabled();
    await expect(projectPage.webhooks.selectExistingButton).toBeDisabled();

    await projectPage.openTab(COPY.tabs.settings);
    await expect(projectPage.settings.nameInput).toHaveValue(bare);
    expect(browserErrors).toEqual([]);
  });
});
