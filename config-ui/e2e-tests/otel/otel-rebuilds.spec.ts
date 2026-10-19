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

import { randomUUID } from 'node:crypto';

import { APIRequestContext } from '@playwright/test';

import { loginAsAdmin } from '../auth-helpers';
import { test, expect } from '../fixtures';
import {
  ApiOtelConnection,
  adminApi,
  createOtelConnection,
  createProject,
  deleteProject,
  retireOtelConnections,
  uniqueName,
} from '../support/api';
import { OTEL_MODAL_COPY, REPLAY_COPY } from '../support/app-copy';
import { deleteOtelConnectionsOfTeam } from '../support/db';
import {
  OtelRowMarks,
  SEEDED_REPLAY_REQUESTER,
  countOtelReplayRequests,
  deleteOtelReplayRows,
  otelAuditEvents,
  otelOrganizationOf,
  otelReplayRequestsFor,
  otelRowMarks,
  seedOtelReplayRequests,
} from '../support/db-otel';
import { requireEnv } from '../support/env';
import { OtelPage } from '../support/pages/otel';
import { OtelRebuildsTable, OtelReplayDialog } from '../support/pages/otel-rebuilds';

const DAY_MS = 86_400_000;
const SEEDED_ROWS = 25;
const REBIND_TARGET_ORGANIZATION = '4d88ba1f-e542-4427-a5d1-841effc21e4b';
const today = new Date().toISOString().slice(0, 10);
const dayOffset = (offset: number) => new Date(Date.parse(today) + offset * DAY_MS).toISOString().slice(0, 10);

type SluggedConnection = ApiOtelConnection & { connection: { teamSlug: string } };

test.describe.serial('Claude Code OTel organization change and data rebuilds', () => {
  let api: APIRequestContext;
  let marks: OtelRowMarks;
  const projectName = uniqueName('otel-rebuild-proj');
  const teamNames: string[] = [];
  const connectionIds: number[] = [];

  const newConnection = async (label: string): Promise<SluggedConnection> => {
    const teamName = uniqueName(label);
    teamNames.push(teamName);
    const created = (await createOtelConnection(api, teamName, [projectName])) as SluggedConnection;
    connectionIds.push(created.connection.id);
    return created;
  };

  const bind = async (id: number, organizationId: string): Promise<void> => {
    const response = await api.patch(`/plugins/claude_otel/connections/${id}/organization`, {
      data: { organizationId },
    });
    expect(response.ok(), `bind organization failed with ${response.status()}`).toBe(true);
  };

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    deleteOtelReplayRows({ pending: true });
    await createProject(api, projectName);
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
    marks = otelRowMarks();
  });

  test.afterEach(() => {
    deleteOtelReplayRows({ after: marks, connectionIds, requestedByLike: SEEDED_REPLAY_REQUESTER });
  });

  test.afterAll(async () => {
    try {
      for (const teamName of teamNames) {
        await retireOtelConnections(api, teamName);
        deleteOtelConnectionsOfTeam(teamName);
      }
    } finally {
      deleteOtelReplayRows({ pending: true, connectionIds, requestedByLike: SEEDED_REPLAY_REQUESTER });
      await deleteProject(api, projectName);
      await api.dispose();
    }
  });

  test('changing the organization with a rebuild queues a waiting rebuild and is audited', async ({ page }) => {
    const { connection } = await newConnection('otel-rebind');
    const { id, teamName, teamSlug } = connection;
    const firstOrganization = randomUUID();
    const newOrganization = REBIND_TARGET_ORGANIZATION;
    await bind(id, firstOrganization);
    const auditBefore = otelAuditEvents(id).length;

    const otel = new OtelPage(page);
    await otel.open();
    const row = otel.connectionRow(teamName);
    await row.reveal();
    await expect.poll(() => row.organization()).toBe(firstOrganization);

    const dialog = await row.rebind();
    await expect(dialog.dialog).toBeVisible();
    await expect(dialog.dialog).toContainText(firstOrganization);
    await dialog.fillOrganization(newOrganization);
    await expect(dialog.rebuildCheckbox).toBeChecked();
    await dialog.setRange(today, today);
    await dialog.continue();

    await expect(dialog.confirmDialog).toBeVisible();
    await expect(dialog.confirmDialog).toContainText(firstOrganization);
    await expect(dialog.confirmDialog).toContainText(newOrganization);
    await expect(dialog.confirmButton).toBeDisabled();
    await dialog.typeSlug(teamSlug);
    await expect(dialog.confirmButton).toBeEnabled();
    await dialog.confirm();
    await expect(dialog.confirmDialog).not.toBeVisible();

    await expect.poll(() => row.organization()).toBe(newOrganization);
    const table = new OtelRebuildsTable(page);
    const rebuild = table.rowFor(today);
    await expect(rebuild).toBeVisible();
    await expect(await table.requestedFor(rebuild)).toHaveText(teamName);
    await expect(await table.stateOf(rebuild)).toHaveText(REPLAY_COPY.state.waiting);

    expect(otelOrganizationOf(teamName)).toBe(newOrganization);
    const audit = otelAuditEvents(id).slice(auditBefore);
    expect(audit.map(({ action }) => action)).toEqual(['organization_rebind', 'replay_requested']);
    expect(audit[0]).toMatchObject({ oldValue: firstOrganization, newValue: newOrganization });
    const replays = otelReplayRequestsFor(id);
    expect(replays).toHaveLength(1);
    expect(replays[0]).toMatchObject({
      status: 'pending',
      requestedBy: requireEnv('E2E_ADMIN_EMAIL').E2E_ADMIN_EMAIL,
      rangeStart: today,
      rangeEnd: dayOffset(1),
    });
  });

  test('an invalid organization ID keeps Continue disabled and Escape changes nothing', async ({ page }) => {
    const { connection } = await newConnection('otel-rebind-invalid');
    const firstOrganization = randomUUID();
    await bind(connection.id, firstOrganization);

    const otel = new OtelPage(page);
    await otel.open();
    const row = otel.connectionRow(connection.teamName);
    await row.reveal();
    const dialog = await row.rebind();
    await dialog.fillOrganization('not-a-uuid');
    await expect(dialog.continueButton).toBeDisabled();
    await dialog.showDisabledReason();
    await expect(dialog.disabledReasonTooltip).toHaveText(OTEL_MODAL_COPY.rebind.invalid);

    await dialog.closeWithEscape();
    await expect(dialog.dialog).not.toBeVisible();
    expect(otelOrganizationOf(connection.teamName)).toBe(firstOrganization);
    expect(otelAuditEvents(connection.id).map(({ action }) => action)).toEqual(['organization_rebind']);
  });

  test('a revoked connection can be opened for an organization change', async ({ page }) => {
    const { connection } = await newConnection('otel-rebind-revoked');
    const revoked = await api.post(`/plugins/claude_otel/connections/${connection.id}/revoke`);
    expect(revoked.ok(), `revoke failed with ${revoked.status()}`).toBe(true);

    const otel = new OtelPage(page);
    await otel.open();
    const row = otel.connectionRow(connection.teamName);
    await row.reveal();
    const dialog = await row.rebind();
    await expect(dialog.revokedNotice).toBeVisible();
    await dialog.cancel();
    await expect(dialog.dialog).not.toBeVisible();
    expect(otelOrganizationOf(connection.teamName)).toBeUndefined();
    expect(otelAuditEvents(connection.id)).toEqual([]);
  });

  test('rebuilding all teams from the section queues one request and reuses it the second time', async ({ page }) => {
    const otel = new OtelPage(page);
    await otel.open();
    const replay = new OtelReplayDialog(page);
    const table = new OtelRebuildsTable(page);
    const countBefore = countOtelReplayRequests();

    await replay.open();
    await replay.setRange(today, today);
    await replay.submit();
    await expect(replay.confirmDialog).toBeVisible();
    await replay.confirm();
    await expect(otel.toast(REPLAY_COPY.queued(1, 0, true))).toBeVisible();

    const rebuild = table.rowFor(today);
    await expect(rebuild).toBeVisible();
    await expect(await table.requestedFor(rebuild)).toHaveText(REPLAY_COPY.manual);
    const countAfterFirst = countOtelReplayRequests();
    expect(countAfterFirst).toBe(countBefore + 1);

    await replay.open();
    await replay.setRange(today, today);
    await replay.submit();
    await replay.confirm();
    await expect(otel.toast(REPLAY_COPY.queued(0, 1, true))).toBeVisible();
    expect(countOtelReplayRequests()).toBe(countAfterFirst);
  });

  test('the rebuild range cannot reach the future or past the 90 day window', async ({ page }) => {
    const otel = new OtelPage(page);
    await otel.open();
    const replay = new OtelReplayDialog(page);
    await replay.open();
    await expect(replay.dialog).toBeVisible();

    const earliest = dayOffset(-89);
    for (const [day, pickable] of [
      [dayOffset(1), false],
      [dayOffset(-90), false],
      [today, true],
      [earliest, true],
    ] as const) {
      await replay.showDay(day);
      await expect(pickable ? replay.pickableDay(day) : replay.blockedDay(day)).toBeVisible();
    }
    await replay.closePicker();
  });

  test('the rebuilds table pages through the server', async ({ page }) => {
    seedOtelReplayRequests(SEEDED_ROWS, 'completed');
    const otel = new OtelPage(page);
    await otel.open();
    const table = new OtelRebuildsTable(page);
    await expect(table.rows.first()).toBeVisible();
    await expect.poll(() => table.total()).toBeGreaterThanOrEqual(SEEDED_ROWS);
    const firstPage = await table.rows.allInnerTexts();

    const secondPageRequest = page.waitForRequest(
      (request) => request.url().includes('/replays') && new URL(request.url()).searchParams.get('page') === '2',
    );
    await table.nextPage();
    await secondPageRequest;
    await expect.poll(() => table.rows.allInnerTexts()).not.toEqual(firstPage);
  });
});
