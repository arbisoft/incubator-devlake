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
  findOtelConnection,
  getProject,
  retireOtelConnections,
  uniqueName,
} from '../support/api';
import { PROJECT_DETAIL_COPY } from '../support/app-copy';
import { deleteOtelConnectionsOfTeam } from '../support/db';
import { ProjectPage } from '../support/pages/projects';

test.describe('Project rename with Claude Code OTel placements', () => {
  let api: APIRequestContext;
  const oldName = uniqueName('rename-old');
  const newName = uniqueName('rename-new');
  const teamName = uniqueName('rename-team');

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    await createProject(api, oldName);
    await createOtelConnection(api, teamName, [oldName]);
  });

  test.afterAll(async () => {
    await retireOtelConnections(api, teamName);
    deleteOtelConnectionsOfTeam(teamName);
    await deleteProject(api, newName);
    await deleteProject(api, oldName);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('renaming from the Settings tab moves the OTel placement to the new name', async ({ page, browserErrors }) => {
    const before = await findOtelConnection(api, teamName);
    expect(before?.projects).toEqual([{ name: oldName }]);

    const projectPage = new ProjectPage(page, oldName);
    await projectPage.openAtTab('settings');
    await expect(projectPage.nameInput).toBeEnabled();
    await projectPage.renameProject(newName);

    await expect(page).toHaveURL(new ProjectPage(page, newName).tabUrlPattern('settings'));
    await expect.poll(async () => (await getProject(api, newName))?.name).toBe(newName);
    expect(await getProject(api, oldName)).toBeUndefined();

    const after = await findOtelConnection(api, teamName);
    expect(after?.projects).toEqual([{ name: newName }]);
    expect(browserErrors).toEqual([]);
  });

  test('saving and renaming preserves the project description', async ({ page, browserErrors }) => {
    const descOldName = uniqueName('desc-old');
    const descNewName = uniqueName('desc-new');
    const description = 'e2e description that must survive save and rename';
    try {
      await createProject(api, descOldName, { description });

      const projectPage = new ProjectPage(page, descOldName);
      await projectPage.openAtTab('settings');
      await expect(projectPage.nameInput).toBeEnabled();
      // Save stays disabled until a setting changes.
      await projectPage.toggleIssueTrace();
      await projectPage.saveSettings();
      await expect(projectPage.toast(PROJECT_DETAIL_COPY.settings.saved)).toBeVisible();
      await expect.poll(async () => (await getProject(api, descOldName))?.description).toBe(description);

      await projectPage.renameProject(descNewName);
      await expect(page).toHaveURL(new ProjectPage(page, descNewName).tabUrlPattern('settings'));
      await expect.poll(async () => (await getProject(api, descNewName))?.name).toBe(descNewName);
      expect(await getProject(api, descOldName)).toBeUndefined();
      expect((await getProject(api, descNewName))?.description).toBe(description);

      await new ProjectPage(page, descNewName).reload();
      expect((await getProject(api, descNewName))?.description).toBe(description);
      expect(browserErrors).toEqual([]);
    } finally {
      await deleteProject(api, descNewName);
      await deleteProject(api, descOldName);
    }
  });
});
