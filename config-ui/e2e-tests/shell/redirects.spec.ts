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
  createGithubConnection,
  createProject,
  deleteConnection,
  deleteProject,
  uniqueName,
} from '../support/api';
import { PATHS } from '../support/pages/paths';
import { ProjectPage } from '../support/pages/projects';
import { RedirectsPage } from '../support/pages/redirects';
import { ShellPage } from '../support/pages/shell';

test.describe.serial('legacy routes and url-based project tabs', () => {
  let api: APIRequestContext;
  let connectionId: number;
  let blueprintId: number;
  const connectionName = uniqueName('gh-redirect');
  const projectName = uniqueName('proj-redirect');
  const unique = () => `github-${connectionId}`;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    connectionId = (await createGithubConnection(api, connectionName)).id;
    const project = await createProject(api, projectName);
    blueprintId = (project.blueprint as { id: number }).id;
  });

  test.afterAll(async () => {
    await deleteProject(api, projectName);
    if (connectionId) {
      await deleteConnection(api, 'github', connectionId);
    }
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('/access redirects to /settings/users and keeps the query string', async ({ page, browserErrors }) => {
    const redirects = new RedirectsPage(page);
    await redirects.openWithQuery(PATHS.access);
    await expect(page).toHaveURL(redirects.landedOn(PATHS.settingsUsers));
    expect(browserErrors).toEqual([]);
  });

  test('/projects/:pname redirects to the blueprint tab and keeps the query string', async ({
    page,
    browserErrors,
  }) => {
    const redirects = new RedirectsPage(page);
    const projectPage = new ProjectPage(page, projectName);
    await redirects.openWithQuery(PATHS.project(projectName));
    await expect(page).toHaveURL(redirects.landedOn(PATHS.projectTab(projectName, 'blueprint')));
    await expect(projectPage.tabFor('blueprint')).toHaveAttribute('aria-selected', 'true');
    expect(browserErrors).toEqual([]);
  });

  test('the legacy project connection URL redirects to the blueprint connection URL', async ({
    page,
    browserErrors,
  }) => {
    const redirects = new RedirectsPage(page);
    await redirects.openWithQuery(PATHS.projectConnectionLegacy(projectName, unique()));
    await expect(page).toHaveURL(redirects.landedOn(PATHS.projectConnection(projectName, unique())));
    expect(browserErrors).toEqual([]);
  });

  test('the legacy blueprint connection URL redirects to the blueprint connection URL', async ({
    page,
    browserErrors,
  }) => {
    const redirects = new RedirectsPage(page);
    await redirects.openWithQuery(PATHS.blueprintConnectionLegacy(blueprintId, unique()));
    await expect(page).toHaveURL(redirects.landedOn(PATHS.blueprintConnection(blueprintId, unique())));
    expect(browserErrors).toEqual([]);
  });

  test('each project tab URL loads directly and survives a reload', async ({ page, browserErrors }) => {
    const projectPage = new ProjectPage(page, projectName);
    const shell = new ShellPage(page);
    for (const tab of projectPage.tabs) {
      await projectPage.openAtTab(tab);
      await expect(page).toHaveURL(projectPage.tabUrlPattern(tab));
      await expect(projectPage.tabFor(tab)).toHaveAttribute('aria-selected', 'true');

      await projectPage.reload();
      await expect(page).toHaveURL(projectPage.tabUrlPattern(tab));
      await expect(projectPage.tabFor(tab)).toHaveAttribute('aria-selected', 'true');
      await expect.poll(() => shell.documentTitle()).toContain(projectName);
    }
    expect(browserErrors).toEqual([]);
  });
});
