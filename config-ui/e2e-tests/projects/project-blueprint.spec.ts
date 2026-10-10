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
  cancelPipelinesOfBlueprint,
  createGithubConnection,
  deleteConnection,
  deleteProject,
  deleteWebhooksByPrefix,
  getPipeline,
  getProject,
  isTerminalPipelineStatus,
  listBlueprintPipelines,
  listWebhooks,
  putGithubScope,
  uniqueName,
  type ApiBlueprint,
} from '../support/api';
import { BLUEPRINT_VIEW } from '../support/app-copy';
import { deletePipelinesNamedLike } from '../support/db';
import { BlueprintPage } from '../support/pages/blueprints';
import { PipelinesPage } from '../support/pages/pipelines';
import { ProjectPage, ProjectsPage } from '../support/pages/projects';

const SCOPE_FULL_NAME = 'e2e-org/e2e-repo';
const SCOPE_ID = String(7_000_000 + Math.floor(Math.random() * 1_000_000));
const DAY_MS = 24 * 60 * 60 * 1000;

test.describe.serial('Project, blueprint, pipeline and webhook flows', () => {
  let api: APIRequestContext;
  let connectionId: number;
  let blueprint: ApiBlueprint;
  const connectionName = uniqueName('gh-project');
  const projectName = uniqueName('proj');

  const projectBlueprint = async () => {
    const project = await getProject(api, projectName);
    expect(project?.blueprint, 'project has a blueprint').toBeDefined();
    return project?.blueprint as ApiBlueprint;
  };

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    connectionId = (await createGithubConnection(api, connectionName)).id;
    await putGithubScope(api, connectionId, { githubId: Number(SCOPE_ID), fullName: SCOPE_FULL_NAME });
  });

  test.afterAll(async () => {
    await deleteProject(api, projectName);
    deletePipelinesNamedLike(projectName);
    await deleteWebhooksByPrefix(api);
    if (connectionId) {
      await deleteConnection(api, 'github', connectionId);
    }
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('create a project from the list and land on its detail page', async ({ page, browserErrors }) => {
    const projects = new ProjectsPage(page);
    const projectPage = new ProjectPage(page, projectName);
    await projects.open();
    await projects.createProject(projectName);

    await projects.search(projectName);
    await expect(projects.projectRow(projectName)).toHaveCount(1);
    await projects.openProject(projectName);
    await expect(page).toHaveURL(projectPage.urlPattern);
    await expect(projectPage.tab('Webhooks')).toBeVisible();
    await expect(projectPage.nameLink).toBeVisible();

    const created = await getProject(api, projectName);
    expect(created?.name).toBe(projectName);
    blueprint = created?.blueprint as ApiBlueprint;
    expect(blueprint.connections).toEqual([]);
    expect(browserErrors).toEqual([]);
  });

  test('add the connection and scope to the project blueprint', async ({ page }) => {
    const projectPage = new ProjectPage(page, projectName);
    await projectPage.open();
    await projectPage.openView(BLUEPRINT_VIEW.CONFIGURATION);
    await projectPage.addConnectionWithScope(connectionName, SCOPE_FULL_NAME);
    await expect(projectPage.toast('Update blueprint successful.')).toBeVisible();

    await expect(projectPage.dataScopeCount(1)).toBeVisible();
    await expect(projectPage.connectionLabel(connectionName)).toBeVisible();
    const current = await projectBlueprint();
    expect(current.connections).toEqual([{ pluginName: 'github', connectionId, scopes: [{ scopeId: SCOPE_ID }] }]);
  });

  test('edit the sync policy and see it persisted after a reload', async ({ page }) => {
    const projectPage = new ProjectPage(page, projectName);
    await projectPage.open();
    await projectPage.openView(BLUEPRINT_VIEW.CONFIGURATION);
    await projectPage.openSyncPolicy();
    await projectPage.fillSyncPolicy('15', '3');
    const before = Date.now();
    await projectPage.saveSyncPolicy();
    await expect(projectPage.toast('Update blueprint successful.')).toBeVisible();

    await projectPage.reload();
    await projectPage.openView(BLUEPRINT_VIEW.CONFIGURATION);
    const policyRow = projectPage.syncPolicy;
    await expect(policyRow).toContainText('Custom');
    await expect(policyRow).toContainText('to Now');
    await expect(policyRow).toContainText('Enabled');

    const current = await projectBlueprint();
    expect(current.cronConfig).toBe('15 3 * * *');
    expect(current.enable).toBe(true);
    expect(current.isManual).toBe(false);
    expect(current.skipOnFail).toBe(true);
    const timeAfter = new Date(current.timeAfter as string).getTime();
    expect(Math.abs(timeAfter - (before - 30 * DAY_MS))).toBeLessThan(2 * DAY_MS);
    blueprint = current;
  });

  test('collect data creates a pipeline visible on the project and pipeline pages, then cancel it', async ({
    page,
  }) => {
    const projectPage = new ProjectPage(page, projectName);
    const pipelines = new PipelinesPage(page);
    await projectPage.open();
    await projectPage.openView(BLUEPRINT_VIEW.STATUS);
    await projectPage.collectData();
    await expect(projectPage.toast('Trigger blueprint successful.')).toBeVisible();

    await expect.poll(async () => (await listBlueprintPipelines(api, blueprint.id)).length).toBe(1);
    const [pipeline] = await listBlueprintPipelines(api, blueprint.id);
    expect(pipeline.blueprintId).toBe(blueprint.id);

    await expect(projectPage.currentPipelineLabel).toBeVisible();
    await projectPage.reload();
    await expect(projectPage.pipelineRow(pipeline.id)).toBeVisible();

    await pipelines.open();
    const listed = pipelines.pipelineRow(pipeline.id);
    await expect(listed).toBeVisible();
    await expect(listed).toContainText(blueprint.name);

    await pipelines.openDetail(pipeline.id);
    await expect(pipelines.detailBreadcrumb(pipeline.id)).toBeVisible();
    await expect(pipelines.tasksCompletedLabel).toBeVisible();

    await cancelPipelinesOfBlueprint(api, blueprint.id);
    await expect.poll(async () => isTerminalPipelineStatus((await getPipeline(api, pipeline.id)).status)).toBe(true);
  });

  test('the blueprint page shows the same connection and sync policy', async ({ page }) => {
    const blueprints = new BlueprintPage(page);
    await blueprints.open();
    const row = blueprints.blueprintRow(blueprint.name);
    await expect(row).toBeVisible();
    await expect(row).toContainText(connectionName);
    await expect(row).toContainText('Custom');
    await expect(blueprints.rowProjectLink(blueprint.name, projectName)).toBeVisible();

    await blueprints.openBlueprint(blueprint.name);
    await expect(page).toHaveURL(blueprints.detailUrlPattern(blueprint.id));
    await blueprints.openView(BLUEPRINT_VIEW.CONFIGURATION);
    await expect(blueprints.connectionLabel(connectionName)).toBeVisible();
    await expect(blueprints.dataScopeCount(1)).toBeVisible();
    const policyRow = blueprints.syncPolicy;
    await expect(policyRow).toContainText('Custom');
    await expect(policyRow).toContainText('Enabled');
  });

  test('create and delete a webhook from the project Webhooks tab', async ({ page }) => {
    const webhookName = uniqueName('webhook');
    const projectPage = new ProjectPage(page, projectName);
    await projectPage.open();
    await projectPage.openTab('Webhooks');
    await projectPage.generateWebhook(webhookName);
    const dialog = projectPage.webhookDialog;

    await expect(projectPage.webhookCurlNotice).toBeVisible();
    const created = (await listWebhooks(api)).find((w) => w.name === webhookName);
    expect(created, 'webhook exists in the API').toBeDefined();
    const webhookId = (created as { id: number }).id;
    await expect(dialog).toContainText(`/api/rest/plugins/webhook/connections/${webhookId}/issues`);
    await expect(dialog).toContainText(`/api/rest/plugins/webhook/connections/${webhookId}/deployments`);
    await expect(dialog).toContainText("-H 'Authorization: Bearer ");

    // Attaching the first webhook re-renders the panel; the one-time key dialog must survive it.
    await expect(projectPage.webhookRow(webhookName)).toBeVisible();
    await expect(projectPage.webhookCurlNotice).toBeVisible();
    await projectPage.closeWebhookDialog();
    await expect(dialog).toBeHidden();
    const current = await projectBlueprint();
    expect(current.connections).toContainEqual({ pluginName: 'webhook', connectionId: webhookId, scopes: [] });

    expect(await projectPage.deleteWebhook(webhookName, webhookId)).toBe(200);
    await expect(projectPage.webhookRow(webhookName)).toHaveCount(0);
    expect((await listWebhooks(api)).find((w) => w.id === webhookId)).toBeUndefined();
    await expect
      .poll(async () => (await projectBlueprint()).connections.filter((c) => c.pluginName === 'webhook'))
      .toEqual([]);
  });

  test('the selected project tab is kept across a reload', async ({ page }) => {
    const projectPage = new ProjectPage(page, projectName);
    await projectPage.open();
    await expect(projectPage.tab('Blueprint')).toHaveAttribute('aria-selected', 'true');
    await projectPage.openTab('Webhooks');
    await expect(projectPage.tab('Webhooks')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(projectPage.tabUrlPattern('webhooks'));
    await projectPage.reload();
    await expect(page).toHaveURL(projectPage.tabUrlPattern('webhooks'));
    await expect(projectPage.tab('Webhooks')).toHaveAttribute('aria-selected', 'true');
    await expect(projectPage.tab('Blueprint')).toHaveAttribute('aria-selected', 'false');
  });

  test('delete the project from its Settings tab', async ({ page }) => {
    const projectPage = new ProjectPage(page, projectName);
    const projects = new ProjectsPage(page);
    await projectPage.open();
    await projectPage.openTab('Settings');
    await projectPage.deleteProject();
    await expect(page).toHaveURL(projects.urlPattern);

    expect(await getProject(api, projectName)).toBeUndefined();
    await projects.search(projectName);
    await expect(projects.noResults()).toBeVisible();
    await expect(projects.projectRow(projectName)).toHaveCount(0);
  });
});
