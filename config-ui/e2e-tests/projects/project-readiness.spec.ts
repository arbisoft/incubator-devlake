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
  attachWebhooksToProject,
  createOtelConnection,
  createProject,
  deleteProject,
  deleteWebhooksByPrefix,
  retireOtelConnections,
  uniqueName,
} from '../support/api';
import {
  BLUEPRINT_VIEW,
  COMMON_COPY,
  INTEGRATION_CATEGORY,
  READINESS_COPY,
  READINESS_SIGNAL,
} from '../support/app-copy';
import { WEBHOOK_PLUGIN_LABEL } from '../support/constants';
import {
  deleteOtelConnectionsOfTeam,
  deleteReadinessSeed,
  readinessSeedIds,
  seedOtelActivity,
  seedProjectCollectedData,
} from '../support/db';
import { ProjectPage, ProjectsPage } from '../support/pages/projects';

const { ISSUE, PR, AI } = READINESS_SIGNAL;
const OTEL_SOURCE = 'Claude Code (OTel)';
const PERCENT_NONE = '0%';
const PERCENT_TWO_OF_THREE = '66.6%';
const PERCENT_FULL = '100%';

test.describe.serial('Project readiness', () => {
  let api: APIRequestContext;
  const prefix = uniqueName('ready');
  const empty = `${prefix}-none`;
  const partial = `${prefix}-two`;
  const full = `${prefix}-all`;
  const team = `${prefix}-team`;
  const webhook = `${prefix}-hook`;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    for (const name of [empty, partial, full]) {
      await createProject(api, name);
    }
    seedProjectCollectedData(partial, readinessSeedIds(`${prefix}-b`));
    seedProjectCollectedData(full, readinessSeedIds(`${prefix}-c`));
    const connection = await createOtelConnection(api, team, [full]);
    seedOtelActivity(`${prefix}-c`, connection.connection.id);
    await attachWebhooksToProject(api, partial, [webhook]);
  });

  test.afterAll(async () => {
    deleteReadinessSeed(prefix);
    await retireOtelConnections(api, team);
    deleteOtelConnectionsOfTeam(team);
    for (const name of [empty, partial, full]) {
      await deleteProject(api, name);
    }
    await deleteWebhooksByPrefix(api);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('the projects table shows each project readiness and its meter label', async ({ page }) => {
    const projects = new ProjectsPage(page);
    await projects.open();
    await projects.search(prefix);
    const { readiness } = projects;
    const expected = [
      { name: partial, available: 2, percent: PERCENT_TWO_OF_THREE },
      { name: empty, available: 0, percent: PERCENT_NONE },
      { name: full, available: 3, percent: PERCENT_FULL },
    ];
    for (const { name, available, percent } of expected) {
      const row = projects.projectRow(name);
      await expect(row).toBeVisible();
      await expect(await readiness.readinessCell(row)).toHaveText(percent);
      await expect(await readiness.readinessMeter(row)).toHaveAccessibleName(READINESS_COPY.summary(available, 3));
    }
  });

  test('the readiness popover names the source of each signal and links to Configurations', async ({ page }) => {
    const projects = new ProjectsPage(page);
    await projects.open();
    await projects.search(prefix);
    const { readiness } = projects;
    await readiness.openReadinessPopover(projects.projectRow(partial));

    await expect(readiness.readinessSignal(ISSUE)).toContainText('Jira');
    await expect(readiness.readinessSignal(PR)).toContainText('GitHub');
    await expect(readiness.readinessSignal(AI)).toContainText(READINESS_COPY.notAvailable);
    await expect(readiness.readinessPopover).toContainText(
      READINESS_COPY.missingHint([READINESS_COPY.signals[AI].missing]),
    );

    await readiness.addConnection();
    await expect(page).toHaveURL(new ProjectPage(page, partial).viewUrlPattern(BLUEPRINT_VIEW.CONFIGURATION));
  });

  test('a fully collected project lists every source and no missing hint', async ({ page }) => {
    const projects = new ProjectsPage(page);
    await projects.open();
    await projects.search(prefix);
    const { readiness } = projects;
    await readiness.openReadinessPopover(projects.projectRow(full));

    await expect(readiness.readinessSignal(AI)).toContainText(OTEL_SOURCE);
    await expect(readiness.readinessAddConnection).toHaveCount(0);
  });

  test('the Settings tab card repeats the readiness states', async ({ page }) => {
    const partialPage = new ProjectPage(page, partial);
    await partialPage.openAtTab('settings');
    const card = partialPage.settings.readinessCard;
    await expect(card.percent(PERCENT_TWO_OF_THREE)).toBeVisible();
    await expect(card.meter).toHaveAccessibleName(READINESS_COPY.summary(2, 3));
    await expect(card.signalStatus(ISSUE, READINESS_COPY.state.available)).toBeVisible();
    await expect(card.signalStatus(PR, READINESS_COPY.state.available)).toBeVisible();
    await expect(card.signalStatus(AI, READINESS_COPY.state.missing)).toBeVisible();

    const emptyPage = new ProjectPage(page, empty);
    await emptyPage.openAtTab('settings');
    await expect(emptyPage.settings.readinessCard.percent(PERCENT_NONE)).toBeVisible();
    await expect(emptyPage.settings.readinessCard.meter).toHaveAccessibleName(READINESS_COPY.summary(0, 3));
    await expect(emptyPage.settings.readinessCard.signalStatus(ISSUE, READINESS_COPY.state.missing)).toBeVisible();
  });

  test('the connections popover lists each connection with its plugin and category', async ({ page }) => {
    const projects = new ProjectsPage(page);
    await projects.open();
    await projects.search(prefix);
    const { readiness } = projects;
    await readiness.openConnectionsPopover(projects.projectRow(partial), [webhook]);

    await expect(readiness.connectionRow(webhook, WEBHOOK_PLUGIN_LABEL, INTEGRATION_CATEGORY.CUSTOM)).toBeVisible();
    await expect(readiness.categoryChip(INTEGRATION_CATEGORY.CUSTOM, 1)).toBeVisible();
  });

  test('a failed scorecard request leaves the table usable with an empty readiness value', async ({ page }) => {
    const projects = new ProjectsPage(page);
    const { readiness } = projects;
    await readiness.failScorecard();
    const failed = readiness.waitForScorecardFailure();
    await projects.open();
    await projects.search(prefix);
    await failed;

    const row = projects.projectRow(partial);
    await expect(row).toBeVisible();
    await expect(await readiness.readinessCell(row)).toHaveText(COMMON_COPY.emptyValue);
    await expect(readiness.toasts).toHaveCount(0);
    await projects.openProject(partial);
    await expect(page).toHaveURL(new ProjectPage(page, partial).urlPattern);
  });
});
