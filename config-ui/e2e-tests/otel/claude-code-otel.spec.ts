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

import { randomUUID } from 'crypto';

import { APIRequestContext } from '@playwright/test';

import { getAdminSessionToken, loginAsAdmin } from '../auth-helpers';
import { test, expect } from '../fixtures';
import {
  adminApi,
  createProject,
  deleteProject,
  findOtelConnection,
  otelCredentialStatuses,
  uniqueName,
} from '../support/api';
import { hiddenOtelConnectionCount, runSql } from '../support/db';
import { APP_URL, COLLECTOR_URL, GRAFANA_URL, OTLP_HTTP_URL, PROMETHEUS_URL } from '../support/env';
import { ConnectionsPage } from '../support/pages/connections';
import { OtelPage } from '../support/pages/otel';

test.describe.serial('Claude Code OTel UI & Lifecycle E2E', () => {
  const testTeamName = `e2e-team-${Date.now().toString().slice(-6)}`;
  const projectName = uniqueName('otel-proj');
  const organizationId = randomUUID();
  let basicAuthHeader = '';
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    api = await adminApi(playwright);
    await createProject(api, projectName);
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  // Removes the test connection if a failed run left it behind.
  test.afterAll(async ({ playwright }) => {
    const appApi = await playwright.request.newContext({
      baseURL: APP_URL,
      extraHTTPHeaders: {
        Cookie: `devlake_session=${getAdminSessionToken()}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    const connections: { connection: { id: number; teamName: string; status: string } }[] = await (
      await appApi.get('/api/plugins/claude_otel/connections')
    ).json();
    const testConnections = connections.filter((it) => it.connection.teamName === testTeamName);
    for (const { connection } of testConnections) {
      if (connection.status === 'active') {
        await appApi.post(`/api/plugins/claude_otel/connections/${connection.id}/revoke`);
      }
      await appApi.post(`/api/plugins/claude_otel/connections/${connection.id}/hide`);
    }
    await appApi.dispose();
    // Removes the facts and source preferences produced by test 2's telemetry.
    runSql(`
      DELETE FROM _tool_claude_code_otel_hourly_activity WHERE organization_id = '${organizationId}';
      DELETE FROM _tool_claude_code_otel_series_state WHERE connection_id IN (${[
        0,
        ...testConnections.map((it) => it.connection.id),
      ].join(',')});
      DELETE FROM ai_activities WHERE workspace_key = '${organizationId}';
      DELETE FROM ai_model_usages WHERE workspace_key = '${organizationId}';
      DELETE FROM ai_tool_decisions WHERE workspace_key = '${organizationId}';
      DELETE FROM ai_source_preferences WHERE workspace_key = '${organizationId}';
      DELETE FROM _raw_otel_claude_code_metric_batches WHERE INSTR(payload_proto, '${organizationId}') > 0;
    `);
    await deleteProject(api, projectName);
    await api.dispose();
  });

  test('1. Navigation from /connections, connection creation, one-time credential presentation, and persistence on refresh', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // 1. Navigate to /connections
    const connectionsPage = new ConnectionsPage(page);
    const otel = new OtelPage(page);
    await connectionsPage.open();
    await expect(page).toHaveURL(/.*\/connections/);

    // 2. Locate and click the Claude Code OTel item
    const otelCard = connectionsPage.card('Claude Code OTel');
    await expect(otelCard).toBeVisible();
    await connectionsPage.openCard('Claude Code OTel');

    // 3. Verify navigation to /otel
    await expect(page).toHaveURL(/.*\/otel/);

    // 4. Click "Generate Claude Settings" button
    await expect(otel.generateButton).toBeVisible();
    const createDialog = await otel.openCredentialDialog();

    // 5. Verify Create Modal and notice copy
    await expect(createDialog.dialog).toBeVisible();
    await expect(createDialog.bindingNotice).toBeVisible();

    // 6. Enter team name
    await createDialog.fillTeamName(testTeamName);

    // 7. Select DevLake project (the dropdown is closed by clicking the modal heading)
    await createDialog.selectProject(projectName);

    // 8. Click "Generate"
    await expect(createDialog.submitButton).toBeEnabled();
    await createDialog.submit();

    // 9. Confirm SnippetModal appears with one-time credentials (allow up to 15s for helper/htpasswd restart)
    const snippet = otel.snippetDialog;
    await expect(snippet.dialog).toBeVisible({ timeout: 15000 });
    await expect(snippet.storageNotice).toBeVisible();

    // Check that code snippet is present
    const codeSnippet = snippet.code;
    await expect(codeSnippet).toBeVisible();
    const snippetText = await codeSnippet.textContent();
    expect(snippetText).toContain('CLAUDE_CODE_ENABLE_TELEMETRY');
    expect(snippetText).toContain('Authorization=Basic');
    basicAuthHeader = snippetText?.match(/Authorization=(Basic [A-Za-z0-9+/=]+)/)?.[1] ?? '';
    expect(basicAuthHeader).not.toBe('');

    // 10. Close snippet modal
    await snippet.close();
    await expect(snippet.dialog).not.toBeVisible();

    // 11. Refresh page and verify no plaintext password remains
    await otel.reload();
    await expect(page).toHaveURL(/.*\/otel/);
    await expect(otel.openDialogs).toHaveCount(0);

    // 12. Verify newly created row in table
    const row = otel.connectionRow(testTeamName);
    await expect(row.root).toBeVisible();
    await expect(row.pendingFirstTelemetry).toBeVisible();
    const created = await findOtelConnection(api, testTeamName);
    expect(created?.connection.status).toBe('active');
    expect(otelCredentialStatuses(created)).toEqual(['active']);
    expect(created?.projects.map((p) => p.name)).toEqual([projectName]);
    // A recent collector restart puts the endpoint in cooldown, so retry Apply until the row is Ready
    await expect(async () => {
      await otel.reload();
      await expect(row.root).toBeVisible({ timeout: 5000 });
      if (!(await row.ready.isVisible())) {
        await row.applyChanges(5000);
      }
      await expect(row.ready).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 70_000, intervals: [3000] });
    await expect(row.active).toBeVisible();
  });

  test('2. Organization binding from first telemetry and canonical source policy', async ({ page }) => {
    test.setTimeout(150_000);
    // 1. The connection created in test 1 is unbound until its first telemetry arrives
    const otel = new OtelPage(page);
    await otel.open();
    const newRow = otel.connectionRow(testTeamName);
    await expect(newRow.root).toBeVisible();
    await expect(newRow.pendingFirstTelemetry).toBeVisible();

    // 2. Send one Claude Code datapoint through the collector with the generated credential
    const attribute = (key: string, value: string) => ({ key, value: { stringValue: value } });
    const otlpResp = await page.request.post(`${OTLP_HTTP_URL}/v1/metrics`, {
      headers: { Authorization: basicAuthHeader, 'Content-Type': 'application/json' },
      data: {
        resourceMetrics: [
          {
            resource: { attributes: [attribute('service.name', 'claude-code')] },
            scopeMetrics: [
              {
                scope: { name: 'com.anthropic.claude_code' },
                metrics: [
                  {
                    name: 'claude_code.session.count',
                    sum: {
                      aggregationTemporality: 1,
                      isMonotonic: true,
                      dataPoints: [
                        {
                          asInt: '1',
                          timeUnixNano: `${BigInt(Date.now()) * 1_000_000n}`,
                          attributes: [
                            attribute('organization.id', organizationId),
                            attribute('user.email', `${testTeamName}@example.invalid`),
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(otlpResp.status(), 'collector accepts telemetry with the generated credential').toBe(200);

    // 3. The backend binds the connection to the telemetry's organization
    await expect
      .poll(
        async () => {
          const resp = await page.request.get('/api/plugins/claude_otel/connections');
          const list: { connection: { teamName: string; organizationId?: string } }[] = await resp.json();
          return list.find((it) => it.connection.teamName === testTeamName)?.connection.organizationId;
        },
        { timeout: 120_000, intervals: [5000] },
      )
      .toBe(organizationId);

    // 4. The row shows the bound organization, and every listed row matches the API
    await otel.reload();
    await expect(newRow.root).toBeVisible();
    expect(await newRow.organization()).toBe(organizationId);
    await expect(newRow.pendingFirstTelemetry).toHaveCount(0);
    const connectionsResp = await page.request.get('/api/plugins/claude_otel/connections');
    expect(connectionsResp.status()).toBe(200);
    const connections: { connection: { teamName: string; organizationId?: string } }[] = await connectionsResp.json();
    const rows = otel.connectionRows(testTeamName);
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i++) {
      const { teamName, organization } = await otel.rowSummary(rows.nth(i));
      const expected = connections
        .filter((it) => it.connection.teamName === teamName)
        .map((it) => it.connection.organizationId ?? 'Pending first telemetry');
      expect(expected, `organization cell for ${teamName}`).toContain(organization);
    }

    // 5. Source policy section shows the otel-preferred metric families reported by the API and no controls to change them
    const preferencesResp = await page.request.get('/api/plugins/claude_otel/source-preferences');
    expect(preferencesResp.status()).toBe(200);
    const preferences: { workspaceKey: string; metricFamily: string; preferredSource: string }[] =
      await preferencesResp.json();
    expect(
      preferences.filter((it) => it.workspaceKey === organizationId && it.preferredSource === 'otel'),
      'the new organization gets otel source preferences',
    ).not.toHaveLength(0);
    const otelPreferences = preferences.filter((preference) => preference.preferredSource === 'otel');

    await expect(otel.policyHeading).toBeVisible();
    await expect(otel.policyCells('otel')).toHaveCount(otelPreferences.length);
    for (const preference of otelPreferences) {
      await expect(otel.policyMetricFamily(preference.metricFamily)).toBeVisible();
    }
    await expect(otel.policyControls).toHaveCount(0);
  });

  test('3. Credential lifecycle: rotate, finalize, revoke, and hide', async ({ page }) => {
    const otel = new OtelPage(page);
    await otel.open();
    await expect(page).toHaveURL(/.*\/otel/);

    const row = otel.connectionRow(testTeamName);
    await expect(row.root).toBeVisible();

    // 1. ROTATE
    await expect(row.rotateButton).toBeEnabled();
    await row.rotate();

    const rotateModal = otel.rotateDialog;
    await expect(rotateModal.dialog).toBeVisible();
    await rotateModal.confirm();

    // Snippet modal appears for rotated credential
    const snippet = otel.snippetDialog;
    await expect(snippet.dialog).toBeVisible({ timeout: 15000 });
    await snippet.close();
    await expect(snippet.dialog).not.toBeVisible();

    // Row should now show retiring and active tags
    await expect(row.retiring).toBeVisible({ timeout: 15000 });
    await expect(row.active).toBeVisible();
    expect(otelCredentialStatuses(await findOtelConnection(api, testTeamName))).toEqual(['active', 'retiring']);

    // 2. FINALIZE
    await expect(row.finalizeButton).toBeEnabled();
    await row.finalize();

    const finalizeModal = otel.finalizeDialog;
    await expect(finalizeModal.dialog).toBeVisible();
    await finalizeModal.confirm();
    await expect(finalizeModal.dialog).not.toBeVisible({ timeout: 15000 });

    // Retiring credential should disappear, leaving one active credential
    await expect(row.retiring).toHaveCount(0, { timeout: 15000 });
    await expect(row.active).toBeVisible();
    expect(otelCredentialStatuses(await findOtelConnection(api, testTeamName))).toEqual(['active', 'revoked']);

    // 3. REVOKE
    await expect(row.revokeButton).toBeEnabled();
    await row.revoke();

    const revokeModal = otel.revokeDialog;
    await expect(revokeModal.dialog).toBeVisible();
    await revokeModal.confirm();
    await expect(revokeModal.dialog).not.toBeVisible({ timeout: 15000 });

    // Status should update to Revoked
    await expect(row.revokedStatus).toBeVisible({ timeout: 15000 });
    await expect(row.revokedTag).toBeVisible();
    const revoked = await findOtelConnection(api, testTeamName);
    expect(revoked?.connection.status).toBe('revoked');
    expect(otelCredentialStatuses(revoked)).toEqual(['revoked', 'revoked']);

    // 4. HIDE (REMOVE)
    await expect(row.removeButton).toBeEnabled();
    await row.remove();

    const removeModal = otel.removeDialog;
    await expect(removeModal.dialog).toBeVisible();
    await removeModal.confirm();
    await expect(removeModal.dialog).not.toBeVisible({ timeout: 15000 });

    // The row should now be removed from the view
    await expect(otel.connectionRow(testTeamName).root).toHaveCount(0, { timeout: 15000 });
    expect(await findOtelConnection(api, testTeamName)).toBeUndefined();
    expect(hiddenOtelConnectionCount(testTeamName)).toBe(1);
  });

  test('4. Existing Grafana Prometheus dashboard verification', async ({ request }) => {
    // Verify Grafana is up and Prometheus datasource is configured
    const grafanaRes = await request.get(`${GRAFANA_URL}/api/health`);
    expect(grafanaRes.status()).toBe(200);

    // Verify Prometheus endpoint is accessible and scraping
    const promRes = await request.get(`${PROMETHEUS_URL}/-/healthy`);
    expect(promRes.status()).toBe(200);

    // Verify Collector Prometheus metrics endpoint
    const collectorMetrics = await request.get(`${COLLECTOR_URL}/metrics`);
    expect(collectorMetrics.status()).toBe(200);
  });
});
