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
  deleteBlueprintsByPrefix,
  listBlueprintPipelines,
  triggerBlueprint,
  uniqueName,
} from '../support/api';
import { PIPELINE_COPY } from '../support/app-copy';
import { deletePipelinesNamedLike } from '../support/db';
import { PipelinesPage } from '../support/pages/pipelines';

const SMALLEST_PAGE_SIZE = 10;

test.describe.serial('Pipelines list blueprint filter, sort and configuration drawer', () => {
  let api: APIRequestContext;
  let blueprintA: ApiBlueprint;
  let pipelineIdsA: number[];
  const prefix = uniqueName('pllist');

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    blueprintA = await createBlueprint(api, `${prefix}-a`);
    const blueprintB = await createBlueprint(api, `${prefix}-b`);
    await triggerBlueprint(api, blueprintA.id);
    await expect
      .poll(async () => {
        await triggerBlueprint(api, blueprintA.id);
        return (await listBlueprintPipelines(api, blueprintA.id)).length;
      })
      .toBeGreaterThan(1);
    await triggerBlueprint(api, blueprintB.id);
    pipelineIdsA = (await listBlueprintPipelines(api, blueprintA.id))
      .map((pipeline) => pipeline.id)
      .sort((a, b) => a - b);
  });

  test.afterAll(async () => {
    await deleteBlueprintsByPrefix(api, prefix);
    deletePipelinesNamedLike(prefix);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('the blueprint filter keeps only that blueprint and survives a reload', async ({ page, browserErrors }) => {
    const pipelines = new PipelinesPage(page);
    await pipelines.open();
    await pipelines.filterByBlueprint(blueprintA.name);
    await expect.poll(() => pipelines.urlParams.get('blueprintId')).toBe(String(blueprintA.id));
    await expect.poll(async () => (await pipelines.pipelineIds()).sort((a, b) => a - b)).toEqual(pipelineIdsA);

    await pipelines.reload();
    await expect.poll(async () => (await pipelines.pipelineIds()).sort((a, b) => a - b)).toEqual(pipelineIdsA);
    expect(browserErrors).toEqual([]);
  });

  test('sorting by started at orders the filtered pipelines and survives a reload', async ({ page }) => {
    const pipelines = new PipelinesPage(page);
    await pipelines.openWithQuery(`blueprintId=${blueprintA.id}&pageSize=${SMALLEST_PAGE_SIZE}`);
    await pipelines.sortByColumn(PIPELINE_COPY.columns.startedAt);
    await expect.poll(() => pipelines.urlParams.get('sortBy')).toBe('beganAt');
    expect(pipelines.urlParams.get('sortOrder')).toBe('asc');
    await expect.poll(() => pipelines.pipelineIds()).toEqual(pipelineIdsA);

    await pipelines.reload();
    await expect.poll(() => pipelines.pipelineIds()).toEqual(pipelineIdsA);

    await pipelines.sortByColumn(PIPELINE_COPY.columns.startedAt);
    await expect.poll(() => pipelines.urlParams.get('sortOrder')).toBe('desc');
    await expect.poll(() => pipelines.pipelineIds()).toEqual([...pipelineIdsA].reverse());
  });

  test('the configuration drawer opens with the pipeline id and its JSON', async ({ page }) => {
    const [pipelineId] = pipelineIdsA;
    const pipelines = new PipelinesPage(page);
    await pipelines.openWithQuery(`blueprintId=${blueprintA.id}`);
    await pipelines.openConfiguration(pipelineId);

    const drawer = pipelines.configurationDrawer(pipelineId);
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(PIPELINE_COPY.drawer.heading);
    await expect(drawer).toContainText(`"id": ${pipelineId}`);
    await expect(drawer).toContainText(`"name": "${blueprintA.name}"`);
  });

  test('closing the configuration drawer returns focus to its row menu button', async ({ page }) => {
    const [pipelineId] = pipelineIdsA;
    const pipelines = new PipelinesPage(page);
    await pipelines.openWithQuery(`blueprintId=${blueprintA.id}`);
    await pipelines.openConfiguration(pipelineId);
    await expect(pipelines.configurationDrawer(pipelineId)).toBeVisible();
    await pipelines.pressEscape();
    await expect(pipelines.configurationDrawer(pipelineId)).toBeHidden();
    await expect(pipelines.rowActionsButton(pipelineId)).toBeFocused();
  });

  test('Detail opens the pipeline panel in a modal and returns focus to the row menu button', async ({ page }) => {
    const [pipelineId] = pipelineIdsA;
    const pipelines = new PipelinesPage(page);
    await pipelines.openWithQuery(`blueprintId=${blueprintA.id}`);
    await pipelines.openDetailModal(pipelineId);
    await expect(pipelines.detailDialog(pipelineId)).toBeVisible();
    await expect(pipelines.detailTasksLabel(pipelineId)).toBeVisible();
    await expect(pipelines.detailOpened(pipelineId)).toBeVisible();
    await pipelines.pressEscape();
    await expect(pipelines.detailDialog(pipelineId)).toBeHidden();
    await expect(pipelines.rowActionsButton(pipelineId)).toBeFocused();
  });
});
