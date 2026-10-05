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

import { test, expect } from '../fixtures';
import { loginAsAdmin } from '../auth-helpers';
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
import {
  cronFieldInputs,
  iconButton,
  emptyState,
  modalByTitle,
  pipelineRowById,
  sectionHeaderButton,
  selectOption,
  tabByName,
  tableRow,
  tableRows,
  toast,
} from '../support/selectors';

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
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New Project' }).click();
    const dialog = modalByTitle(page, 'Create a New Project');
    await dialog.getByPlaceholder('Your Project Name').fill(projectName);
    await dialog.getByRole('button', { name: 'Save' }).click();

    await page.getByPlaceholder('Search project ...').fill(projectName);
    const row = tableRow(page, projectName);
    await expect(row).toHaveCount(1);
    await row.getByRole('link', { name: projectName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${encodeURIComponent(projectName)}$`));
    await expect(tabByName(page, 'Webhooks')).toBeVisible();
    await expect(page.getByRole('link', { name: projectName })).toBeVisible();

    const project = await getProject(api, projectName);
    expect(project?.name).toBe(projectName);
    blueprint = project?.blueprint as ApiBlueprint;
    expect(blueprint.connections).toEqual([]);
    expect(browserErrors).toEqual([]);
  });

  test('add the connection and scope to the project blueprint', async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await tabByName(page, 'Configuration').click();
    await page.getByRole('button', { name: 'Add a Connection' }).click();
    const dialog = modalByTitle(page, /Add a Connection/);
    await dialog.getByRole('combobox').click();
    await selectOption(page, connectionName).click();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByText(SCOPE_FULL_NAME, { exact: true }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page, 'Update blueprint successful.')).toBeVisible();

    await expect(page.getByText('1 data scope')).toBeVisible();
    await expect(page.getByText(connectionName)).toBeVisible();
    const current = await projectBlueprint();
    expect(current.connections).toEqual([{ pluginName: 'github', connectionId, scopes: [{ scopeId: SCOPE_ID }] }]);
  });

  test('edit the sync policy and see it persisted after a reload', async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await tabByName(page, 'Configuration').click();
    await sectionHeaderButton(page, 'Sync Policy').click();
    const dialog = modalByTitle(page, 'Set Sync Policy');
    await dialog.getByText('Last 30 days').click();
    await dialog.getByRole('radio', { name: 'Custom' }).check();
    const fields = cronFieldInputs(dialog);
    await fields.nth(0).fill('15');
    await fields.nth(1).fill('3');
    await dialog.getByRole('checkbox').check();
    const before = Date.now();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page, 'Update blueprint successful.')).toBeVisible();

    await page.reload();
    await tabByName(page, 'Configuration').click();
    const policyRow = tableRows(page).first();
    await expect(policyRow).toContainText('Custom');
    await expect(policyRow).toContainText('to Now');
    await expect(policyRow).toContainText('Enabled');

    const current = await projectBlueprint();
    expect(current.cronConfig).toBe('15 3 * * *');
    expect(current.isManual).toBe(false);
    expect(current.skipOnFail).toBe(true);
    const timeAfter = new Date(current.timeAfter as string).getTime();
    expect(Math.abs(timeAfter - (before - 30 * DAY_MS))).toBeLessThan(2 * DAY_MS);
    blueprint = current;
  });

  test('collect data creates a pipeline visible on the project and pipeline pages, then cancel it', async ({
    page,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await tabByName(page, 'Status').click();
    await page.getByRole('button', { name: 'Collect Data' }).click();
    await expect(toast(page, 'Trigger blueprint successful.')).toBeVisible();

    await expect.poll(async () => (await listBlueprintPipelines(api, blueprint.id)).length).toBe(1);
    const [pipeline] = await listBlueprintPipelines(api, blueprint.id);
    expect(pipeline.blueprintId).toBe(blueprint.id);

    await expect(page.getByText('Current Pipeline')).toBeVisible();
    await page.reload();
    await expect(pipelineRowById(page, pipeline.id)).toBeVisible();

    await page.goto('/advanced/pipelines');
    const listed = pipelineRowById(page, pipeline.id);
    await expect(listed).toBeVisible();
    await expect(listed).toContainText(blueprint.name);

    await page.goto(`/advanced/pipeline/${pipeline.id}`);
    await expect(page.getByRole('link', { name: String(pipeline.id), exact: true })).toBeVisible();
    await expect(page.getByText('Tasks Completed', { exact: true })).toBeVisible();

    await cancelPipelinesOfBlueprint(api, blueprint.id);
    await expect.poll(async () => isTerminalPipelineStatus((await getPipeline(api, pipeline.id)).status)).toBe(true);
  });

  test('the blueprint page shows the same connection and sync policy', async ({ page }) => {
    await page.goto('/advanced/blueprints');
    const row = tableRow(page, blueprint.name);
    await expect(row).toBeVisible();
    await expect(row).toContainText(connectionName);
    await expect(row).toContainText('Custom');
    await expect(row.getByRole('link', { name: projectName, exact: true })).toBeVisible();

    await row.getByRole('link', { name: blueprint.name }).click();
    await expect(page).toHaveURL(new RegExp(`/advanced/blueprints/${blueprint.id}$`));
    await tabByName(page, 'Configuration').click();
    await expect(page.getByText(connectionName)).toBeVisible();
    await expect(page.getByText('1 data scope')).toBeVisible();
    const policyRow = tableRows(page).first();
    await expect(policyRow).toContainText('Custom');
    await expect(policyRow).toContainText('Enabled');
  });

  test('create and delete a webhook from the project Webhooks tab', async ({ page }) => {
    const webhookName = uniqueName('webhook');
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await tabByName(page, 'Webhooks').click();
    await page.getByRole('button', { name: 'Add a Webhook' }).click();
    const dialog = modalByTitle(page, 'Add a New Webhook');
    await dialog.getByPlaceholder('Webhook Name').fill(webhookName);
    await dialog.getByRole('button', { name: 'Generate POST URL' }).click();

    await expect(dialog.getByText('CURL commands generated. Please copy them now.')).toBeVisible();
    const created = (await listWebhooks(api)).find((w) => w.name === webhookName);
    expect(created, 'webhook exists in the API').toBeDefined();
    const webhookId = (created as { id: number }).id;
    await expect(dialog).toContainText(`/api/rest/plugins/webhook/connections/${webhookId}/issues`);
    await expect(dialog).toContainText(`/api/rest/plugins/webhook/connections/${webhookId}/deployments`);
    await expect(dialog).toContainText("-H 'Authorization: Bearer ");

    // Attaching the first webhook re-renders the panel; the one-time key dialog must survive it.
    const row = tableRow(page, webhookName);
    await expect(row).toBeVisible();
    await expect(dialog.getByText('CURL commands generated. Please copy them now.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    const current = await projectBlueprint();
    expect(current.connections).toContainEqual({ pluginName: 'webhook', connectionId: webhookId, scopes: [] });

    await iconButton(row, 'delete').click();
    const deleted = page.waitForResponse(
      (res) => res.url().endsWith(`/plugins/webhook/connections/${webhookId}`) && res.request().method() === 'DELETE',
    );
    await modalByTitle(page, 'Delete this Webhook?').getByRole('button', { name: 'Confirm' }).click();
    expect((await deleted).status()).toBe(200);
    await expect(tableRow(page, webhookName)).toHaveCount(0);
    expect((await listWebhooks(api)).find((w) => w.id === webhookId)).toBeUndefined();
    await expect
      .poll(async () => (await projectBlueprint()).connections.filter((c) => c.pluginName === 'webhook'))
      .toEqual([]);
  });

  test('the selected project tab is not kept across a reload', async ({ page }) => {
    // Currently the tab lives in router state; the reskin changes it to URL-based tabs.
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await expect(tabByName(page, 'Blueprint')).toHaveAttribute('aria-selected', 'true');
    await tabByName(page, 'Webhooks').click();
    await expect(tabByName(page, 'Webhooks')).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(tabByName(page, 'Blueprint')).toHaveAttribute('aria-selected', 'true');
    await expect(tabByName(page, 'Webhooks')).toHaveAttribute('aria-selected', 'false');
  });

  test('delete the project from its Settings tab', async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await tabByName(page, 'Settings').click();
    await page.getByRole('button', { name: 'Delete Project' }).click();
    await modalByTitle(page, 'Are you sure you want to delete this Project?')
      .getByRole('button', { name: 'Confirm' })
      .click();
    await expect(page).toHaveURL(/\/projects$/);

    expect(await getProject(api, projectName)).toBeUndefined();
    await page.getByPlaceholder('Search project ...').fill(projectName);
    await expect(emptyState(page, 'No data')).toBeVisible();
    await expect(tableRow(page, projectName)).toHaveCount(0);
  });
});
