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
import { adminApi, createProject, deleteProject, uniqueName } from '../support/api';
import { PROJECT_HOME_COPY } from '../support/app-copy';
import { ProjectsPage } from '../support/pages/projects';

const PROJECT_COUNT = 12;
const SMALLEST_PAGE_SIZE = 10;
const ORDINALS = Array.from({ length: PROJECT_COUNT }, (_, index) => String(index + 1).padStart(2, '0'));

test.describe.serial('Projects list search, sort and pagination', () => {
  let api: APIRequestContext;
  const prefix = uniqueName('plist');
  const names = ORDINALS.map((ordinal) => `${prefix}-${ordinal}`);

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    for (const name of names) {
      await createProject(api, name);
    }
  });

  test.afterAll(async () => {
    for (const name of names) {
      await deleteProject(api, name);
    }
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('search, sort and page survive a reload', async ({ page, browserErrors }) => {
    const projects = new ProjectsPage(page);
    await projects.openWithQuery(`pageSize=${SMALLEST_PAGE_SIZE}`);
    await projects.search(prefix);
    await expect.poll(() => projects.urlParams.get('keyword')).toBe(prefix);
    await expect.poll(async () => (await projects.projectNames()).length).toBe(SMALLEST_PAGE_SIZE);

    await projects.sortByColumn(PROJECT_HOME_COPY.columns.name);
    await expect.poll(() => projects.urlParams.get('sortBy')).toBe('name');
    expect(projects.urlParams.get('sortOrder')).toBe('asc');
    await expect.poll(() => projects.projectNames()).toEqual(names.slice(0, SMALLEST_PAGE_SIZE));

    await projects.goToListPage(2);
    await expect.poll(() => projects.urlParams.get('page')).toBe('2');
    await expect.poll(() => projects.projectNames()).toEqual(names.slice(SMALLEST_PAGE_SIZE));

    await projects.reload();
    expect(Object.fromEntries(projects.urlParams)).toEqual({
      pageSize: String(SMALLEST_PAGE_SIZE),
      keyword: prefix,
      sortBy: 'name',
      sortOrder: 'asc',
      page: '2',
    });
    await expect.poll(() => projects.projectNames()).toEqual(names.slice(SMALLEST_PAGE_SIZE));

    await projects.sortByColumn(PROJECT_HOME_COPY.columns.name);
    await expect.poll(() => projects.urlParams.get('sortOrder')).toBe('desc');
    await expect.poll(() => projects.projectNames()).toEqual(names.slice(0, 2).reverse());
    expect(browserErrors).toEqual([]);
  });

  test('a search with no match shows the empty state and keeps the keyword', async ({ page }) => {
    const projects = new ProjectsPage(page);
    await projects.open();
    await projects.search(`${prefix}-no-such-project`);
    await expect(projects.noResults()).toBeVisible();
    await projects.reload();
    await expect(projects.noResults()).toBeVisible();
    expect(projects.urlParams.get('keyword')).toBe(`${prefix}-no-such-project`);
  });
});
