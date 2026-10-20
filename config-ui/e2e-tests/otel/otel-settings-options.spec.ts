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
  createProject,
  deleteProject,
  findOtelConnection,
  retireOtelConnections,
  uniqueName,
  waitForOtelRestartCooldown,
} from '../support/api';
import { OTEL_MODAL_COPY } from '../support/app-copy';
import { deleteOtelConnectionsOfTeam } from '../support/db';
import { scrollState, waitUntilOpened, wheelPastContentEnd } from '../support/pages/common';
import { OtelPage } from '../support/pages/otel';
import { createdManagedEnv, OtelSettingsOptions } from '../support/pages/otel-settings';

const OPTIONS = OTEL_MODAL_COPY.snippet.options;
const BASIC_HEADER_PREFIX = 'Authorization=Basic ';

test.describe.serial('Claude Code OTel managed settings options', () => {
  let api: APIRequestContext;
  const projectName = uniqueName('otel-settings-proj');
  const teamName = uniqueName('otel-settings');

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    await createProject(api, projectName);
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test.afterAll(async () => {
    try {
      await retireOtelConnections(api, teamName);
      deleteOtelConnectionsOfTeam(teamName);
    } finally {
      await deleteProject(api, projectName);
      await api.dispose();
    }
  });

  test('shapes the generated managed settings before copying', async ({ page }) => {
    test.setTimeout(120_000);
    await waitForOtelRestartCooldown();

    const otel = new OtelPage(page);
    await otel.open();
    const createDialog = await otel.openCredentialDialog();
    await createDialog.fillTeamName(teamName);
    await createDialog.selectProject(projectName);
    const createdEnvPromise = createdManagedEnv(page);
    const created = await createDialog.submit();
    expect(created.status).toBe(201);

    const snippet = otel.snippetDialog;
    await expect(snippet.dialog).toBeVisible({ timeout: 15000 });
    const options = new OtelSettingsOptions(snippet);

    const createdEnv = await createdEnvPromise;
    await expect.poll(async () => (await options.settings()).env).toEqual(createdEnv);

    await waitUntilOpened(snippet.dialog);
    const { modalTop } = await scrollState(snippet.dialog);
    await wheelPastContentEnd(snippet.dialog);
    await expect.poll(() => scrollState(snippet.dialog)).toEqual({ contentAtEnd: true, modalTop });

    await options.option(OPTIONS.logs.label).uncheck();
    await expect
      .poll(async () => (await options.settings()).env)
      .toMatchObject({
        OTEL_LOGS_EXPORTER: 'none',
        OTEL_LOG_USER_PROMPTS: '0',
        OTEL_LOG_TOOL_DETAILS: '0',
        OTEL_METRICS_INCLUDE_REPOSITORY: 'false',
      });
    await expect(options.option(OPTIONS.promptText.label)).not.toBeVisible();
    await expect(options.option(OPTIONS.toolDetails.label)).not.toBeVisible();
    await expect(options.option(OPTIONS.metrics.label)).toBeDisabled();
    await expect(options.lastSignalHint).toBeVisible();

    await options.option(OPTIONS.logs.label).check();
    await options.option(OPTIONS.promptText.label).uncheck();
    await options.option(OPTIONS.toolDetails.label).uncheck();
    await options.option(OPTIONS.repository.label).uncheck();
    await expect
      .poll(async () => (await options.settings()).env)
      .toMatchObject({
        OTEL_LOG_USER_PROMPTS: '0',
        OTEL_LOG_TOOL_DETAILS: '0',
        OTEL_METRICS_INCLUDE_REPOSITORY: 'false',
      });
    await expect
      .poll(async () => (await options.settings()).env.OTEL_EXPORTER_OTLP_HEADERS.startsWith(BASIC_HEADER_PREFIX))
      .toBe(true);

    await options.option(OPTIONS.metrics.label).uncheck();
    await expect.poll(async () => (await options.settings()).env).toMatchObject({ OTEL_METRICS_EXPORTER: 'none' });
    await expect.poll(async () => (await options.settings()).env).not.toHaveProperty('OTEL_METRIC_EXPORT_INTERVAL');

    await snippet.close();

    const stored = await findOtelConnection(api, teamName);
    expect(stored?.connection.status).toBe('active');
  });
});
