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
  deleteProject,
  retireOtelConnections,
  uniqueName,
} from '../support/api';
import { OTEL_MODAL_COPY } from '../support/app-copy';
import { deleteOtelConnectionsOfTeam } from '../support/db';
import { OtelPage } from '../support/pages/otel';

test.describe.serial('Claude Code OTel dialogs', () => {
  let api: APIRequestContext;
  const projectName = uniqueName('otel-dialog-proj');
  const teamName = uniqueName('otel-dialog-team');

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    await createProject(api, projectName);
    await createOtelConnection(api, teamName, [projectName]);
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test.afterAll(async () => {
    await retireOtelConnections(api, teamName);
    deleteOtelConnectionsOfTeam(teamName);
    await deleteProject(api, projectName);
    await api.dispose();
  });

  test('the projects form explains why Save is disabled and returns focus to its opener', async ({ page }) => {
    const otel = new OtelPage(page);
    await otel.open();
    const row = otel.connectionRow(teamName);
    await row.reveal();
    await expect(row.root).toBeVisible();

    const dialog = await row.openProjects();
    await expect(dialog.dialog).toBeVisible();
    await expect(dialog.selectedProjects).toHaveText(projectName);
    await expect(dialog.saveButton).toBeEnabled();

    await dialog.clearProjects();
    await expect(dialog.saveButton).toBeDisabled();
    await dialog.showDisabledReason();
    await expect(dialog.disabledReasonTooltip).toHaveText(OTEL_MODAL_COPY.projectsModal.disabledReason);

    await dialog.moveOffDisabledReason();
    await expect(dialog.disabledReasonTooltip).toHaveCount(0);
    await dialog.tabWithin();
    expect(await dialog.hasFocusInside()).toBe(true);
    await dialog.closeWithEscape();
    await expect(dialog.dialog).not.toBeVisible();
    await expect(row.projectsButton).toBeFocused();
  });

  test('the create handoff from a project opens the form with that project and clears the URL', async ({ page }) => {
    const otel = new OtelPage(page);
    await otel.openWithCreateIntent(projectName);
    const dialog = otel.credentialDialog;
    await expect(dialog.dialog).toBeVisible();
    await expect(dialog.projectTags).toHaveText(projectName);
    await expect(dialog.submitButton).toBeDisabled();
    await expect(page).toHaveURL(otel.urlPattern);

    await dialog.closeWithEscape();
    await expect(dialog.dialog).not.toBeVisible();
    await expect(otel.generateButton).toBeVisible();
  });

  test('the apply dialog names the team and returns focus to its opener on cancel', async ({ page }) => {
    const otel = new OtelPage(page);
    await otel.routeRestartRequired(teamName);
    await otel.open();
    const row = otel.connectionRow(teamName);
    await row.reveal();
    await expect(row.root).toBeVisible();

    const dialog = await row.openApplyDialog();
    await expect(dialog.dialog).toBeVisible();
    await expect(dialog.dialog).toContainText(teamName);
    await dialog.cancel();
    await expect(dialog.dialog).not.toBeVisible();
    await expect(row.applyButton).toBeFocused();
  });
});
