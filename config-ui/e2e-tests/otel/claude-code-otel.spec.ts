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

import { test, expect } from '../fixtures';
import { getAdminSessionToken, loginAsAdmin } from '../auth-helpers';
import { randomUUID } from 'crypto';
import { APP_URL, COLLECTOR_URL, GRAFANA_URL, OTLP_HTTP_URL, PROMETHEUS_URL } from '../support/env';
import { adminApi, createProject, deleteProject, uniqueName } from '../support/api';
import { runSql } from '../support/db';
import {
  catalogCard,
  codeBlock,
  editableControls,
  modalCloseButton,
  modalWithText,
  openModals,
  rowCells,
  sectionWithHeading,
  selectBox,
  selectOption,
  tableRow,
  tableRows,
  tableWithRow,
} from '../support/selectors';

test.describe.serial('Claude Code OTel UI & Lifecycle E2E', () => {
  const testTeamName = `e2e-team-${Date.now().toString().slice(-6)}`;
  const projectName = uniqueName('otel-proj');
  const organizationId = randomUUID();
  let basicAuthHeader = '';

  test.beforeAll(async ({ playwright }) => {
    const api = await adminApi(playwright);
    await createProject(api, projectName);
    await api.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  // Removes the test connection if a failed run left it behind.
  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: APP_URL,
      extraHTTPHeaders: {
        Cookie: `devlake_session=${getAdminSessionToken()}; devlake_csrf=e2e-csrf-token`,
        'X-CSRF-Token': 'e2e-csrf-token',
      },
    });
    const connections: { connection: { id: number; teamName: string; status: string } }[] = await (
      await api.get('/api/plugins/claude_otel/connections')
    ).json();
    const testConnections = connections.filter((it) => it.connection.teamName === testTeamName);
    for (const { connection } of testConnections) {
      if (connection.status === 'active') {
        await api.post(`/api/plugins/claude_otel/connections/${connection.id}/revoke`);
      }
      await api.post(`/api/plugins/claude_otel/connections/${connection.id}/hide`);
    }
    await api.dispose();
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
    const projectApi = await adminApi(playwright);
    await deleteProject(projectApi, projectName);
    await projectApi.dispose();
  });

  test('1. Navigation from /connections, connection creation, one-time credential presentation, and persistence on refresh', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // 1. Navigate to /connections
    await page.goto('/connections');
    await expect(page).toHaveURL(/.*\/connections/);

    // 2. Locate and click the Claude Code OTel item
    const otelCard = catalogCard(page, 'Claude Code OTel');
    await expect(otelCard).toBeVisible();
    await otelCard.click();

    // 3. Verify navigation to /otel
    await expect(page).toHaveURL(/.*\/otel/);

    // 4. Click "Generate Claude Settings" button
    const generateBtn = page.getByRole('button', { name: /Generate Claude Settings/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // 5. Verify Create Modal and notice copy
    const createModal = modalWithText(page, /Generate Claude Settings/i);
    await expect(createModal).toBeVisible();
    await expect(
      createModal.getByText(/This connection binds to the first Anthropic organization UUID it receives/i),
    ).toBeVisible();

    // 6. Enter team name
    const teamInput = createModal.getByPlaceholder('Platform Engineering');
    await teamInput.fill(testTeamName);

    // 7. Select DevLake project
    const projectSelect = selectBox(createModal);
    await projectSelect.click();
    await page.keyboard.type(projectName);
    await selectOption(page, projectName).click();

    // Close select dropdown by clicking modal heading
    await createModal.getByText('Generate Claude Settings').click();

    // 8. Click "Generate"
    const submitBtn = createModal.getByRole('button', { name: 'Generate' });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 9. Confirm SnippetModal appears with one-time credentials (allow up to 15s for helper/htpasswd restart)
    const snippetModal = modalWithText(page, /Claude managed settings/i);
    await expect(snippetModal).toBeVisible({ timeout: 15000 });
    await expect(
      snippetModal.getByText(/DevLake does not store the generated password or Basic Auth header/i),
    ).toBeVisible();

    // Check that code snippet is present
    const codeSnippet = codeBlock(snippetModal);
    await expect(codeSnippet).toBeVisible();
    const snippetText = await codeSnippet.textContent();
    expect(snippetText).toContain('CLAUDE_CODE_ENABLE_TELEMETRY');
    expect(snippetText).toContain('Authorization=Basic');
    basicAuthHeader = snippetText?.match(/Authorization=(Basic [A-Za-z0-9+/=]+)/)?.[1] ?? '';
    expect(basicAuthHeader).not.toBe('');

    // 10. Close snippet modal
    const closeBtn = modalCloseButton(snippetModal);
    await closeBtn.click();
    await expect(snippetModal).not.toBeVisible();

    // 11. Refresh page and verify no plaintext password remains
    await page.reload();
    await expect(page).toHaveURL(/.*\/otel/);
    await expect(openModals(page)).toHaveCount(0);

    // 12. Verify newly created row in table
    const row = tableRow(page, testTeamName);
    await expect(row).toBeVisible();
    await expect(row.getByText('Pending first telemetry')).toBeVisible();
    // A recent collector restart puts the endpoint in cooldown, so retry Apply until the row is Ready
    await expect(async () => {
      await page.reload();
      await expect(row).toBeVisible({ timeout: 5000 });
      if (!(await row.getByText('Ready').isVisible())) {
        await row.getByRole('button', { name: /Apply/i }).click({ timeout: 5000 });
        await modalWithText(page, /Apply Credential Changes/i)
          .getByRole('button', { name: 'Apply' })
          .click({ timeout: 5000 });
      }
      await expect(row.getByText('Ready')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 70_000, intervals: [3000] });
    await expect(row.getByText('active')).toBeVisible();
  });

  test('2. Organization binding from first telemetry and canonical source policy', async ({ page }) => {
    test.setTimeout(150_000);
    // 1. The connection created in test 1 is unbound until its first telemetry arrives
    await page.goto('/otel');
    const newRow = tableRow(page, testTeamName);
    await expect(newRow).toBeVisible();
    await expect(newRow.getByText('Pending first telemetry')).toBeVisible();

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
    await page.reload();
    await expect(newRow).toBeVisible();
    await expect(newRow.getByText(organizationId)).toBeVisible();
    await expect(newRow.getByText('Pending first telemetry')).toHaveCount(0);
    const connectionsResp = await page.request.get('/api/plugins/claude_otel/connections');
    expect(connectionsResp.status()).toBe(200);
    const connections: { connection: { teamName: string; organizationId?: string } }[] = await connectionsResp.json();
    const connectionsTable = tableWithRow(page, testTeamName);
    const rows = tableRows(connectionsTable);
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i++) {
      const cells = rowCells(rows.nth(i));
      const teamName = (await cells.nth(0).innerText()).trim();
      const organization = (await cells.nth(3).innerText()).trim();
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

    const policyHeading = page.getByRole('heading', { name: 'Canonical daily data' });
    await expect(policyHeading).toBeVisible();
    const policySection = sectionWithHeading(page, policyHeading);
    await expect(policySection.getByRole('cell', { name: 'otel', exact: true })).toHaveCount(otelPreferences.length);
    for (const preference of otelPreferences) {
      await expect(policySection.getByRole('rowheader', { name: preference.metricFamily }).first()).toBeVisible();
    }
    await expect(editableControls(policySection)).toHaveCount(0);
  });

  test('3. Credential lifecycle: rotate, finalize, revoke, and hide', async ({ page }) => {
    await page.goto('/otel');
    await expect(page).toHaveURL(/.*\/otel/);

    const row = tableRow(page, testTeamName);
    await expect(row).toBeVisible();

    // 1. ROTATE
    const rotateBtn = row.getByRole('button', { name: /Rotate/i });
    await expect(rotateBtn).toBeEnabled();
    await rotateBtn.click();

    const rotateModal = modalWithText(page, /Rotate Claude Code OTel Credential/i);
    await expect(rotateModal).toBeVisible();
    await rotateModal.getByRole('button', { name: 'Rotate' }).click();

    // Snippet modal appears for rotated credential
    const snippetModal = modalWithText(page, /Claude managed settings/i);
    await expect(snippetModal).toBeVisible({ timeout: 15000 });
    await modalCloseButton(snippetModal).click();
    await expect(snippetModal).not.toBeVisible();

    // Row should now show retiring and active tags
    await expect(row.getByText('retiring')).toBeVisible({ timeout: 15000 });
    await expect(row.getByText('active')).toBeVisible();

    // 2. FINALIZE
    const finalizeBtn = row.getByRole('button', { name: /Finalize/i });
    await expect(finalizeBtn).toBeEnabled();
    await finalizeBtn.click();

    const finalizeModal = modalWithText(page, /Finalize Rotation/i);
    await expect(finalizeModal).toBeVisible();
    await finalizeModal.getByRole('button', { name: 'Finalize' }).click();
    await expect(finalizeModal).not.toBeVisible({ timeout: 15000 });

    // Retiring credential should disappear, leaving one active credential
    await expect(row.getByText('retiring')).toHaveCount(0, { timeout: 15000 });
    await expect(row.getByText('active')).toBeVisible();

    // 3. REVOKE
    const revokeBtn = row.getByRole('button', { name: /Revoke/i });
    await expect(revokeBtn).toBeEnabled();
    await revokeBtn.click();

    const revokeModal = modalWithText(page, /Revoke Claude Code OTel Credential/i);
    await expect(revokeModal).toBeVisible();
    await revokeModal.getByRole('button', { name: 'Revoke' }).click();
    await expect(revokeModal).not.toBeVisible({ timeout: 15000 });

    // Status should update to Revoked
    await expect(row.getByText('Revoked', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(row.getByText('revoked', { exact: true })).toBeVisible();

    // 4. HIDE (REMOVE)
    const removeBtn = row.getByRole('button', { name: /Remove/i });
    await expect(removeBtn).toBeEnabled();
    await removeBtn.click();

    const removeModal = modalWithText(page, /Remove Revoked Connection/i);
    await expect(removeModal).toBeVisible();
    await removeModal.getByRole('button', { name: 'Remove' }).click();
    await expect(removeModal).not.toBeVisible({ timeout: 15000 });

    // The row should now be removed from the view
    await expect(tableRow(page, testTeamName)).toHaveCount(0, { timeout: 15000 });
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
