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
  isTerminalPipelineStatus,
  listBlueprintPipelines,
  retireOtelConnections,
  triggerBlueprint,
  uniqueName,
} from '../support/api';
import { CONNECTIONS_COPY, PIPELINE_STATUS_COPY, PROJECT_HOME_COPY } from '../support/app-copy';
import { deleteOtelConnectionsOfTeam, deletePipelinesNamedLike } from '../support/db';
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
    const keyword = `${prefix}-no-such-project`;
    await projects.search(keyword);
    await expect.poll(() => projects.urlParams.get('keyword')).toBe(keyword);
    await expect(projects.noResults()).toBeVisible();
    await projects.reload();
    await expect(projects.noResults()).toBeVisible();
    expect(projects.urlParams.get('keyword')).toBe(keyword);
  });

  test('searching while typing filters the list without Enter', async ({ page }) => {
    const projects = new ProjectsPage(page);
    await projects.open();
    await projects.typeSearch(names[0]);
    await expect.poll(() => projects.urlParams.get('keyword')).toBe(names[0]);
    await expect(projects.projectRow(names[0])).toBeVisible();
  });
});

test.describe.serial('Projects column filters', () => {
  let api: APIRequestContext;
  const prefix = uniqueName('pfilt');
  const teamName = `${prefix}-team`;
  const names = { otel: `${prefix}-otel`, ran: `${prefix}-ran`, idle: `${prefix}-idle` };
  let otelId: number;
  let otelName = '';
  let ranStatusLabel: string | undefined;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    for (const name of Object.values(names)) {
      await createProject(api, name);
    }
    await createOtelConnection(api, teamName, [names.otel]);
    const otel = (await findOtelConnection(api, teamName))?.connection;
    otelId = otel?.id ?? 0;
    otelName = otel?.name ?? '';

    const blueprintId = (await getProject(api, names.ran))?.blueprint?.id ?? 0;
    await triggerBlueprint(api, blueprintId);
    await expect
      .poll(async () =>
        (await listBlueprintPipelines(api, blueprintId)).every((p) => isTerminalPipelineStatus(p.status)),
      )
      .toBe(true);
    const latestStatus = (await listBlueprintPipelines(api, blueprintId))[0]?.status;
    ranStatusLabel = Object.entries(PIPELINE_STATUS_COPY).find(([status]) => status === latestStatus)?.[1];
  });

  test.afterAll(async () => {
    await retireOtelConnections(api, teamName);
    deleteOtelConnectionsOfTeam(teamName);
    for (const name of Object.values(names)) {
      await deleteProject(api, name);
    }
    deletePipelinesNamedLike(prefix);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('filters projects by data connection, including an OTel connection', async ({ page, browserErrors }) => {
    const projects = new ProjectsPage(page);
    await projects.openWithQuery(`keyword=${prefix}`);
    await expect.poll(async () => (await projects.projectNames()).sort()).toEqual(Object.values(names).sort());

    await projects.filterColumn(PROJECT_HOME_COPY.columns.connections, [`${otelName} (${CONNECTIONS_COPY.otelName})`]);
    await expect.poll(() => projects.urlParams.getAll('connection')).toEqual([`claude_otel:${otelId}`]);
    await expect.poll(() => projects.projectNames()).toEqual([names.otel]);

    await projects.reload();
    await expect.poll(() => projects.projectNames()).toEqual([names.otel]);

    await projects.clearColumnFilter(PROJECT_HOME_COPY.columns.connections);
    await expect.poll(() => projects.urlParams.getAll('connection')).toEqual([]);
    await expect.poll(async () => (await projects.projectNames()).sort()).toEqual(Object.values(names).sort());
    expect(browserErrors).toEqual([]);
  });

  test('filters projects by last run status', async ({ page, browserErrors }) => {
    const projects = new ProjectsPage(page);
    await projects.openWithQuery(`keyword=${prefix}`);
    await expect.poll(async () => (await projects.projectNames()).length).toBe(Object.keys(names).length);
    expect(ranStatusLabel).toBeDefined();
    const statusLabel = ranStatusLabel ?? '';
    await expect.poll(() => projects.lastRunStatusText(names.ran)).toBe(statusLabel);

    await projects.filterColumn(PROJECT_HOME_COPY.columns.lastRunStatus, [statusLabel]);
    await expect.poll(() => projects.urlParams.getAll('lastRunStatus').length).toBe(1);
    await expect.poll(() => projects.projectNames()).toEqual([names.ran]);

    await projects.reload();
    await expect.poll(() => projects.projectNames()).toEqual([names.ran]);

    await projects.clearColumnFilter(PROJECT_HOME_COPY.columns.lastRunStatus);
    await expect.poll(() => projects.urlParams.getAll('lastRunStatus')).toEqual([]);
    await expect.poll(async () => (await projects.projectNames()).sort()).toEqual(Object.values(names).sort());
    expect(browserErrors).toEqual([]);
  });
});
