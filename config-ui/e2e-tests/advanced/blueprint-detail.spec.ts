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
  ApiBlueprint,
  createBlueprint,
  createProject,
  deleteBlueprintsByPrefix,
  deleteProject,
  getBlueprint,
  listBlueprintPipelines,
  triggerBlueprint,
  uniqueName,
} from '../support/api';
import { BLUEPRINT_VIEW } from '../support/app-copy';
import { deletePipelinesNamedLike } from '../support/db';
import { BlueprintDetailPage } from '../support/pages/blueprint-detail';
import { ProjectPage } from '../support/pages/projects';

const VIEWS = Object.values(BLUEPRINT_VIEW);
const DAY_MS = 24 * 60 * 60 * 1000;

test.describe.serial('Blueprint detail views and pipeline panel', () => {
  let api: APIRequestContext;
  let blueprint: ApiBlueprint;
  let pipelineId: number;
  const prefix = uniqueName('bpdetail');
  const projectName = `${prefix}-proj`;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    blueprint = await createBlueprint(api, `${prefix}-bp`);
    await triggerBlueprint(api, blueprint.id);
    pipelineId = (await listBlueprintPipelines(api, blueprint.id))[0].id;
    await createProject(api, projectName);
  });

  test.afterAll(async () => {
    await deleteProject(api, projectName);
    await deleteBlueprintsByPrefix(api, prefix);
    deletePipelinesNamedLike(prefix);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('each view of a project blueprint loads by URL and survives a reload', async ({ page, browserErrors }) => {
    const projectPage = new ProjectPage(page, projectName);
    for (const view of VIEWS) {
      await projectPage.openViewDirect(view);
      await expect(page).toHaveURL(projectPage.viewUrlPattern(view));
      await expect(projectPage.selectedViewOption(view)).toBeVisible();
      await expect(projectPage.viewContent(view)).toBeVisible();

      await projectPage.reload();
      await expect(page).toHaveURL(projectPage.viewUrlPattern(view));
      await expect(projectPage.selectedViewOption(view)).toBeVisible();
      await expect(projectPage.viewContent(view)).toBeVisible();
    }
    expect(browserErrors).toEqual([]);
  });

  test('each view of an advanced blueprint loads by URL and survives a reload', async ({ page, browserErrors }) => {
    const detail = new BlueprintDetailPage(page, blueprint.id);
    for (const view of VIEWS) {
      await detail.open(view);
      await expect(page).toHaveURL(detail.viewUrlPattern(view));
      await expect(detail.selectedViewOption(view)).toBeVisible();
      await expect(detail.viewContent(view)).toBeVisible();

      await detail.reload();
      await expect(page).toHaveURL(detail.viewUrlPattern(view));
      await expect(detail.selectedViewOption(view)).toBeVisible();
      await expect(detail.viewContent(view)).toBeVisible();
    }
    expect(browserErrors).toEqual([]);
  });

  test('the view switch changes the URL and Status is the default', async ({ page }) => {
    const detail = new BlueprintDetailPage(page, blueprint.id);
    await detail.open();
    await expect(detail.selectedViewOption(BLUEPRINT_VIEW.STATUS)).toBeVisible();

    await detail.openView(BLUEPRINT_VIEW.CONFIGURATION);
    await expect(page).toHaveURL(detail.viewUrlPattern(BLUEPRINT_VIEW.CONFIGURATION));
    await expect(detail.viewContent(BLUEPRINT_VIEW.CONFIGURATION)).toBeVisible();

    await detail.openView(BLUEPRINT_VIEW.STATUS);
    await expect(page).toHaveURL(detail.viewUrlPattern(BLUEPRINT_VIEW.STATUS));
    await expect(detail.viewContent(BLUEPRINT_VIEW.STATUS)).toBeVisible();
  });

  test('a pipeline run shows on the Status view as the current pipeline and in the history', async ({ page }) => {
    const detail = new BlueprintDetailPage(page, blueprint.id);
    await detail.open();
    await expect(detail.currentPipelineHeading).toBeVisible();
    await expect(detail.noCurrentRun).toBeHidden();
    await expect(detail.pipelineTasksLabel).toBeVisible();
    await expect(detail.historicalPipelinesHeading).toBeVisible();
    await expect(detail.pipelineRow(pipelineId)).toBeVisible();
  });

  test('a historical row opens its pipeline in a modal, Escape closes it and focus returns to the row menu', async ({
    page,
  }) => {
    const detail = new BlueprintDetailPage(page, blueprint.id);
    await detail.open();
    await detail.openPipelineDetail(pipelineId);
    await expect(detail.pipelineDetailDialog(pipelineId)).toBeVisible();
    await expect(detail.pipelineDetailTasksLabel(pipelineId)).toBeVisible();
    await expect(detail.pipelineDetailOpened(pipelineId)).toBeVisible();

    await detail.pressEscape();
    await expect(detail.pipelineDetailDialog(pipelineId)).toBeHidden();
    await expect(detail.rowMenuButton(pipelineId)).toBeFocused();
  });

  test('the sync policy of an advanced blueprint is edited, kept after a reload and saved to the API', async ({
    page,
  }) => {
    const detail = new BlueprintDetailPage(page, blueprint.id);
    await detail.open(BLUEPRINT_VIEW.CONFIGURATION);
    await detail.openSyncPolicy();
    await detail.fillSyncPolicy('45', '6');
    const before = Date.now();
    await detail.saveSyncPolicy();
    await expect(detail.toast('Update blueprint successful.')).toBeVisible();
    await expect(detail.syncPolicyDialog).toBeHidden();

    await detail.reload();
    await expect(detail.syncPolicy).toContainText('Custom');
    await expect(detail.syncPolicy).toContainText('to Now');
    await expect(detail.syncPolicy).toContainText('Enabled');

    const current = await getBlueprint(api, blueprint.id);
    expect(current.cronConfig).toBe('45 6 * * *');
    expect(current.isManual).toBe(false);
    expect(current.skipOnFail).toBe(true);
    expect(Math.abs(new Date(current.timeAfter as string).getTime() - (before - 30 * DAY_MS))).toBeLessThan(2 * DAY_MS);
  });

  test('Escape closes the sync policy dialog and focus returns to its edit button', async ({ page }) => {
    const detail = new BlueprintDetailPage(page, blueprint.id);
    await detail.open(BLUEPRINT_VIEW.CONFIGURATION);
    await detail.openSyncPolicy();
    await expect(detail.syncPolicyDialog).toBeVisible();

    await detail.pressEscape();
    await expect(detail.syncPolicyDialog).toBeHidden();
    await expect(detail.editSyncPolicyButton).toBeFocused();
  });

  test('renaming an advanced blueprint is saved and shown', async ({ page }) => {
    const renamed = `${prefix}-renamed`;
    const detail = new BlueprintDetailPage(page, blueprint.id);
    await detail.open(BLUEPRINT_VIEW.CONFIGURATION);
    await detail.renameBlueprint(renamed);
    await expect(detail.toast('Update blueprint successful.')).toBeVisible();
    await expect(detail.nameSection).toContainText(renamed);

    expect((await getBlueprint(api, blueprint.id)).name).toBe(renamed);
  });
});
