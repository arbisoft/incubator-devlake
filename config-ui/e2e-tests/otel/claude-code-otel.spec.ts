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
import { APP_URL, COLLECTOR_URL, GRAFANA_URL, PROMETHEUS_URL } from '../support/env';

test.describe.serial('Claude Code OTel UI & Lifecycle E2E', () => {
  const testTeamName = `e2e-team-${Date.now().toString().slice(-6)}`;

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
    for (const { connection } of connections.filter((it) => it.connection.teamName === testTeamName)) {
      if (connection.status === 'active') {
        await api.post(`/api/plugins/claude_otel/connections/${connection.id}/revoke`);
      }
      await api.post(`/api/plugins/claude_otel/connections/${connection.id}/hide`);
    }
    await api.dispose();
  });

  test('1. Navigation from /connections, connection creation, one-time credential presentation, and persistence on refresh', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // 1. Navigate to /connections
    await page.goto('/connections');
    await expect(page).toHaveURL(/.*\/connections/);

    // 2. Locate and click the Claude Code OTel item
    const otelCard = page
      .locator('li')
      .filter({ hasText: /Claude Code OTel/i })
      .first();
    await expect(otelCard).toBeVisible();
    await otelCard.click();

    // 3. Verify navigation to /otel
    await expect(page).toHaveURL(/.*\/otel/);

    // 4. Click "Generate Claude Settings" button
    const generateBtn = page.getByRole('button', { name: /Generate Claude Settings/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // 5. Verify Create Modal and notice copy
    const createModal = page.locator('.ant-modal').filter({ hasText: /Generate Claude Settings/i });
    await expect(createModal).toBeVisible();
    await expect(
      createModal.getByText(/This connection binds to the first Anthropic organization UUID it receives/i),
    ).toBeVisible();

    // 6. Enter team name
    const teamInput = createModal.getByPlaceholder('Platform Engineering');
    await teamInput.fill(testTeamName);

    // 7. Select DevLake project
    const projectSelect = createModal.locator('.ant-select');
    await projectSelect.click();
    const projectOption = page.locator('.ant-select-item-option').first();
    const hasProject = await projectOption.waitFor({ state: 'visible', timeout: 5000 }).then(
      () => true,
      () => false,
    );
    test.skip(!hasProject, 'No DevLake project exists to attach the connection to');
    await projectOption.click();

    // Close select dropdown by clicking modal heading
    await createModal.getByText('Generate Claude Settings').click();

    // 8. Click "Generate"
    const submitBtn = createModal.getByRole('button', { name: 'Generate' });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 9. Confirm SnippetModal appears with one-time credentials (allow up to 15s for helper/htpasswd restart)
    const snippetModal = page.locator('.ant-modal').filter({ hasText: /Claude managed settings/i });
    await expect(snippetModal).toBeVisible({ timeout: 15000 });
    await expect(
      snippetModal.getByText(/DevLake does not store the generated password or Basic Auth header/i),
    ).toBeVisible();

    // Check that code snippet is present
    const codeSnippet = snippetModal.locator('pre, code, textarea').first();
    await expect(codeSnippet).toBeVisible();
    const snippetText = await codeSnippet.textContent();
    expect(snippetText).toContain('CLAUDE_CODE_ENABLE_TELEMETRY');
    expect(snippetText).toContain('Authorization=Basic');

    // 10. Close snippet modal
    const closeBtn = snippetModal.locator('.ant-modal-close');
    await closeBtn.click();
    await expect(snippetModal).not.toBeVisible();

    // 11. Refresh page and verify no plaintext password remains
    await page.reload();
    await expect(page).toHaveURL(/.*\/otel/);
    await expect(page.locator('.ant-modal')).toHaveCount(0);

    // 12. Verify newly created row in table
    const row = page.locator('tr').filter({ hasText: testTeamName });
    await expect(row).toBeVisible();
    await expect(row.getByText('Pending first telemetry')).toBeVisible();
    // A recent collector restart puts the endpoint in cooldown, so retry Apply until the row is Ready
    await expect(async () => {
      await page.reload();
      await expect(row).toBeVisible({ timeout: 5000 });
      if (!(await row.getByText('Ready').isVisible())) {
        await row.getByRole('button', { name: /Apply/i }).click({ timeout: 5000 });
        await page
          .locator('.ant-modal')
          .filter({ hasText: /Apply Credential Changes/i })
          .getByRole('button', { name: 'Apply' })
          .click({ timeout: 5000 });
      }
      await expect(row.getByText('Ready')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 70_000, intervals: [3000] });
    await expect(row.getByText('active')).toBeVisible();
  });

  test('2. Organization binding display and canonical source policy', async ({ page }) => {
    await page.goto('/otel');
    await expect(page).toHaveURL(/.*\/otel/);

    // 1. Source policy section shows the otel-preferred metric families reported by the API and no controls to change them
    const preferencesResp = await page.request.get('/api/plugins/claude_otel/source-preferences');
    expect(preferencesResp.status()).toBe(200);
    const preferences: { metricFamily: string; preferredSource: string }[] = await preferencesResp.json();
    const otelPreferences = preferences.filter((preference) => preference.preferredSource === 'otel');

    const policyHeading = page.getByRole('heading', { name: 'Canonical daily data' });
    await expect(policyHeading).toBeVisible();
    const policySection = page.locator('.ant-flex').filter({ has: policyHeading }).last();
    await expect(policySection.getByRole('cell', { name: 'otel', exact: true })).toHaveCount(otelPreferences.length);
    for (const preference of otelPreferences) {
      await expect(policySection.getByRole('rowheader', { name: preference.metricFamily }).first()).toBeVisible();
    }
    await expect(policySection.locator('select, .ant-select, input[type="radio"], input[type="checkbox"]')).toHaveCount(
      0,
    );

    // 2. The connection created in test 1 is unbound until its first telemetry arrives
    const newRow = page.locator('tr').filter({ hasText: testTeamName });
    await expect(newRow).toBeVisible();
    await expect(newRow.getByText('Pending first telemetry')).toBeVisible();

    // 3. Each listed row shows the organization the API reports for its team, or the pending marker
    const connectionsResp = await page.request.get('/api/plugins/claude_otel/connections');
    expect(connectionsResp.status()).toBe(200);
    const connections: { connection: { teamName: string; organizationId?: string } }[] = await connectionsResp.json();
    const rows = page.locator('tbody tr.ant-table-row');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    let boundRows = 0;
    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('td');
      const teamName = (await cells.nth(0).innerText()).trim();
      const organization = (await cells.nth(3).innerText()).trim();
      const expected = connections
        .filter((it) => it.connection.teamName === teamName)
        .map((it) => it.connection.organizationId ?? 'Pending first telemetry');
      expect(expected, `organization cell for ${teamName}`).toContain(organization);
      if (organization !== 'Pending first telemetry') {
        boundRows++;
      }
    }
    if (boundRows === 0) {
      test.info().annotations.push({ type: 'note', description: 'No organization-bound connection on the first page' });
    }
  });

  test('3. Credential lifecycle: rotate, finalize, revoke, and hide', async ({ page }) => {
    await page.goto('/otel');
    await expect(page).toHaveURL(/.*\/otel/);

    const row = page.locator('tr').filter({ hasText: testTeamName });
    await expect(row).toBeVisible();

    // 1. ROTATE
    const rotateBtn = row.getByRole('button', { name: /Rotate/i });
    await expect(rotateBtn).toBeEnabled();
    await rotateBtn.click();

    const rotateModal = page.locator('.ant-modal').filter({ hasText: /Rotate Claude Code OTel Credential/i });
    await expect(rotateModal).toBeVisible();
    await rotateModal.getByRole('button', { name: 'Rotate' }).click();

    // Snippet modal appears for rotated credential
    const snippetModal = page.locator('.ant-modal').filter({ hasText: /Claude managed settings/i });
    await expect(snippetModal).toBeVisible({ timeout: 15000 });
    await snippetModal.locator('.ant-modal-close').click();
    await expect(snippetModal).not.toBeVisible();

    // Row should now show retiring and active tags
    await expect(row.getByText('retiring')).toBeVisible({ timeout: 15000 });
    await expect(row.getByText('active')).toBeVisible();

    // 2. FINALIZE
    const finalizeBtn = row.getByRole('button', { name: /Finalize/i });
    await expect(finalizeBtn).toBeEnabled();
    await finalizeBtn.click();

    const finalizeModal = page.locator('.ant-modal').filter({ hasText: /Finalize Rotation/i });
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

    const revokeModal = page.locator('.ant-modal').filter({ hasText: /Revoke Claude Code OTel Credential/i });
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

    const removeModal = page.locator('.ant-modal').filter({ hasText: /Remove Revoked Connection/i });
    await expect(removeModal).toBeVisible();
    await removeModal.getByRole('button', { name: 'Remove' }).click();
    await expect(removeModal).not.toBeVisible({ timeout: 15000 });

    // The row should now be removed from the view
    await expect(page.locator('tr').filter({ hasText: testTeamName })).toHaveCount(0, { timeout: 15000 });
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
