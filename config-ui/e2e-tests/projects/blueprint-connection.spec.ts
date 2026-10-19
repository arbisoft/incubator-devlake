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
  createGithubConnection,
  createProject,
  deleteBlueprintsByPrefix,
  deleteConnection,
  deleteProject,
  getBlueprint,
  getProject,
  putGithubScope,
  setBlueprintConnections,
  uniqueName,
} from '../support/api';
import { BLUEPRINT_VIEW } from '../support/app-copy';
import { BlueprintConnectionPage } from '../support/pages/blueprint-connection';
import { BlueprintDetailPage } from '../support/pages/blueprint-detail';
import { ProjectPage } from '../support/pages/projects';

const SCOPE_FULL_NAME = 'e2e-org/e2e-repo';
const SCOPE_ID = String(8_000_000 + Math.floor(Math.random() * 1_000_000));

test.describe.serial('Blueprint connection detail', () => {
  let api: APIRequestContext;
  let connectionId: number;
  let blueprint: ApiBlueprint;
  let projectBlueprint: ApiBlueprint;
  const prefix = uniqueName('bpconn');
  const connectionName = `${prefix}-gh`;
  const projectName = `${prefix}-proj`;
  const unique = () => `github-${connectionId}`;
  const attached = () => [{ pluginName: 'github', connectionId, scopes: [{ scopeId: SCOPE_ID }] }];

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    connectionId = (await createGithubConnection(api, connectionName)).id;
    await putGithubScope(api, connectionId, { githubId: Number(SCOPE_ID), fullName: SCOPE_FULL_NAME });
    blueprint = await createBlueprint(api, `${prefix}-bp`, { connections: attached() });
    await createProject(api, projectName);
    projectBlueprint = (await getProject(api, projectName))?.blueprint as ApiBlueprint;
    await setBlueprintConnections(api, projectBlueprint, attached());
  });

  test.afterAll(async () => {
    await deleteProject(api, projectName);
    await deleteBlueprintsByPrefix(api, prefix);
    if (connectionId) {
      await deleteConnection(api, 'github', connectionId);
    }
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('the connection card on the Configurations view opens the data scope of that connection', async ({
    page,
    browserErrors,
  }) => {
    const detail = new BlueprintDetailPage(page, blueprint.id);
    const connection = new BlueprintConnectionPage(page);
    await detail.open(BLUEPRINT_VIEW.CONFIGURATION);
    await expect(detail.connectionCard(connectionName)).toBeVisible();
    await detail.openConnectionScopes(connectionName);

    await expect(page).toHaveURL(connection.advancedUrlPattern(blueprint.id, unique()));
    await expect(connection.heading(connectionName)).toBeVisible();
    await expect(connection.scopeRow(SCOPE_FULL_NAME)).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test('the Configurations breadcrumb goes back to the Configurations view of an advanced blueprint', async ({
    page,
  }) => {
    const detail = new BlueprintDetailPage(page, blueprint.id);
    const connection = new BlueprintConnectionPage(page);
    await connection.openInBlueprint(blueprint.id, unique());
    await connection.goBackToConfigurations();

    await expect(page).toHaveURL(detail.viewUrlPattern(BLUEPRINT_VIEW.CONFIGURATION));
    await expect(detail.selectedViewOption(BLUEPRINT_VIEW.CONFIGURATION)).toBeVisible();
    await expect(detail.viewContent(BLUEPRINT_VIEW.CONFIGURATION)).toBeVisible();
  });

  test('the Configurations breadcrumb goes back to the Configurations view of a project blueprint', async ({
    page,
  }) => {
    const projectPage = new ProjectPage(page, projectName);
    const connection = new BlueprintConnectionPage(page);
    await connection.openInProject(projectName, unique());
    await expect(connection.heading(connectionName)).toBeVisible();
    await connection.goBackToConfigurations();

    await expect(page).toHaveURL(projectPage.viewUrlPattern(BLUEPRINT_VIEW.CONFIGURATION));
    await expect(projectPage.selectedViewOption(BLUEPRINT_VIEW.CONFIGURATION)).toBeVisible();
    await expect(projectPage.viewContent(BLUEPRINT_VIEW.CONFIGURATION)).toBeVisible();
  });

  test('Escape closes the Manage Data Scope dialog and focus returns to its button', async ({ page }) => {
    const connection = new BlueprintConnectionPage(page);
    await connection.openInProject(projectName, unique());
    await connection.openManage();
    await expect(connection.manageDialog).toBeVisible();

    await connection.pressEscape();
    await expect(connection.manageDialog).toBeHidden();
    await expect(connection.manageButton).toBeFocused();
  });

  test('removing the connection from a project blueprint asks first, then goes back to the Configurations view', async ({
    page,
  }) => {
    const projectPage = new ProjectPage(page, projectName);
    const connection = new BlueprintConnectionPage(page);
    await connection.openInProject(projectName, unique());
    await connection.removeConnection(connectionName);
    await expect(connection.followUpDialog).toBeVisible();
    await connection.postponeRecollect();

    await expect(page).toHaveURL(projectPage.viewUrlPattern(BLUEPRINT_VIEW.CONFIGURATION));
    await expect.poll(async () => (await getProject(api, projectName))?.blueprint?.connections).toEqual([]);
    expect((await getBlueprint(api, blueprint.id)).connections).toEqual(attached());
  });
});
