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
import { Locator, Page } from '@playwright/test';

import { COMMON_COPY, OTEL_COPY, OTEL_INGESTION_STATE, OTEL_MODAL_COPY, OTEL_STATUS } from '../app-copy';

import {
  BasePage,
  Screen,
  cellFullText,
  modalWithText,
  selectBox,
  chooseOption,
  tableRow,
  tableRows,
  tableWithRow,
  urlEndingWith,
} from './common';
import { PATHS } from './paths';

type ListedConnection = { connection: { teamName: string }; restartRequired: boolean; managedSettings?: unknown };

const CONNECTIONS_API_PATH = '/api/plugins/claude_otel/connections';

type LifecycleKey = keyof typeof OTEL_COPY.confirm;
type IngestionState = (typeof OTEL_INGESTION_STATE)[keyof typeof OTEL_INGESTION_STATE];
const FIRST_PAYLOAD_BUTTON_NAME = new RegExp(`^${OTEL_COPY.health.viewPayloadFor('')}`);

const columnCell = async (table: Locator, row: Locator, column: string): Promise<Locator> => {
  const header = table.getByRole('columnheader', { name: column, exact: true });
  const index = await header.evaluate((element) => (element as HTMLTableCellElement).cellIndex);
  return row.getByRole('cell').nth(index);
};

// The "Generate Claude Settings" form.
export class OtelCredentialDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return modalWithText(this.page, OTEL_MODAL_COPY.create.title);
  }

  get bindingNotice(): Locator {
    return this.dialog.getByText(OTEL_COPY.organization.createNotice);
  }

  get submitButton(): Locator {
    return this.dialog.getByRole('button', { name: OTEL_MODAL_COPY.create.submit, exact: true });
  }

  get projectTags(): Locator {
    return this.dialog.locator('.ant-select-selection-item');
  }

  async closeWithEscape(): Promise<void> {
    await this.dialog.press('Escape');
  }

  async fillTeamName(teamName: string): Promise<void> {
    await this.dialog.getByPlaceholder(OTEL_MODAL_COPY.create.teamName.placeholder).fill(teamName);
  }

  // Picks the project by typing its name into the select, then closes the dropdown through the dialog heading.
  async selectProject(projectName: string): Promise<void> {
    await selectBox(this.dialog).click();
    await this.page.keyboard.type(projectName);
    await chooseOption(this.page, projectName);
    await this.dialog.getByText(OTEL_MODAL_COPY.create.title).click();
  }

  async submit(): Promise<{ status: number; durationMs: number }> {
    const startedAt = Date.now();
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/plugins/claude_otel/connections',
      { timeout: 0 },
    );
    await this.submitButton.click();
    const response = await responsePromise;
    return { status: response.status(), durationMs: Date.now() - startedAt };
  }
}

// The one-time "Claude managed settings" snippet shown after a credential is generated or rotated.
export class OtelSnippetDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return modalWithText(this.page, OTEL_MODAL_COPY.snippet.title);
  }

  get storageNotice(): Locator {
    return this.dialog.getByText(OTEL_MODAL_COPY.snippet.storageNotice);
  }

  get code(): Locator {
    return this.dialog.locator('pre, code, textarea').first();
  }

  async close(): Promise<void> {
    await this.dialog.getByRole('button', { name: COMMON_COPY.close }).click();
  }

  async closeWithEscape(): Promise<void> {
    await this.dialog.press('Escape');
  }
}

// The "Manage Claude Code OTel Projects" form.
export class OtelProjectsDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole('dialog', { name: OTEL_MODAL_COPY.projectsModal.title });
  }

  get saveButton(): Locator {
    return this.dialog.getByRole('button', { name: OTEL_MODAL_COPY.projectsModal.submit, exact: true });
  }

  get selectedProjects(): Locator {
    return this.dialog.locator('.ant-select-selection-item');
  }

  get disabledReasonTooltip(): Locator {
    return this.page.getByRole('tooltip');
  }

  async clearProjects(): Promise<void> {
    await selectBox(this.dialog).hover();
    await this.dialog.locator('.ant-select-clear').click();
  }

  async showDisabledReason(): Promise<void> {
    await this.saveButton.hover();
  }

  async closeWithEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  async moveOffDisabledReason(): Promise<void> {
    await this.page.mouse.move(0, 0);
  }

  async tabWithin(): Promise<void> {
    await this.page.keyboard.press('Tab');
  }

  async hasFocusInside(): Promise<boolean> {
    return this.dialog.evaluate((dialog) => dialog.contains(document.activeElement));
  }
}

// A confirmation dialog of a credential lifecycle action (apply, rotate, finalize, revoke, remove).
export class OtelActionDialog {
  constructor(
    private readonly page: Page,
    private readonly action: LifecycleKey,
    private readonly teamName: string,
  ) {}

  get dialog(): Locator {
    return this.page.getByRole('dialog', { name: OTEL_COPY.confirm[this.action].title(this.teamName) });
  }

  async confirm(clickTimeout?: number): Promise<void> {
    await this.dialog
      .getByRole('button', { name: OTEL_COPY.confirm[this.action].confirm, exact: true })
      .click({ timeout: clickTimeout });
  }

  async closeWithEscape(): Promise<void> {
    await this.dialog.press('Escape');
  }

  async cancel(): Promise<void> {
    await this.dialog.getByRole('button', { name: COMMON_COPY.cancel, exact: true }).click();
  }
}

// A row of the Claude Code OTel connections table.
export class OtelConnectionRow {
  constructor(
    private readonly page: Page,
    private readonly teamName: string,
  ) {}

  get root(): Locator {
    return tableRow(this.page, this.teamName);
  }

  private get table(): Locator {
    return this.page.getByRole('table', { name: OTEL_COPY.connections.tableLabel, exact: true });
  }

  private async credentials(): Promise<Locator> {
    return columnCell(this.table, this.root, OTEL_COPY.connections.columns.credentials);
  }

  private button(label: string): Locator {
    return this.root.getByRole('button', { name: label, exact: true });
  }

  get pendingFirstTelemetry(): Locator {
    return this.root.getByText(OTEL_COPY.organization.pending);
  }

  get ready(): Locator {
    return this.root.getByText(OTEL_COPY.state.ready, { exact: true });
  }

  async active(): Promise<Locator> {
    return (await this.credentials()).getByText(OTEL_COPY.credentialStatus[OTEL_STATUS.ACTIVE], { exact: true });
  }

  async retiring(): Promise<Locator> {
    return (await this.credentials()).getByText(OTEL_COPY.credentialStatus[OTEL_STATUS.RETIRING], { exact: true });
  }

  async revokedStatus(): Promise<Locator> {
    return (await columnCell(this.table, this.root, OTEL_COPY.connections.columns.status)).getByText(
      OTEL_COPY.state.revoked,
      { exact: true },
    );
  }

  async revokedTag(): Promise<Locator> {
    return (await this.credentials()).getByText(OTEL_COPY.credentialStatus[OTEL_STATUS.REVOKED], { exact: true });
  }

  get projectsButton(): Locator {
    return this.button(OTEL_COPY.actions.projects(this.teamName));
  }

  get rotateButton(): Locator {
    return this.button(OTEL_COPY.actions.rotate(this.teamName));
  }

  get finalizeButton(): Locator {
    return this.button(OTEL_COPY.actions.finalize(this.teamName));
  }

  get revokeButton(): Locator {
    return this.button(OTEL_COPY.actions.revoke(this.teamName));
  }

  get removeButton(): Locator {
    return this.button(OTEL_COPY.actions.hide(this.teamName));
  }

  get applyButton(): Locator {
    return this.button(OTEL_COPY.actions.apply(this.teamName));
  }

  async organization(): Promise<string> {
    return cellFullText(await columnCell(this.table, this.root, OTEL_COPY.connections.columns.organization));
  }

  async rotate(): Promise<void> {
    await this.rotateButton.click();
  }

  async finalize(): Promise<void> {
    await this.finalizeButton.click();
  }

  async revoke(): Promise<void> {
    await this.revokeButton.click();
  }

  async remove(): Promise<void> {
    await this.removeButton.click();
  }

  async openProjects(): Promise<OtelProjectsDialog> {
    await this.projectsButton.click();
    return new OtelProjectsDialog(this.page);
  }

  // Applies pending credential changes: opens the row action and confirms its dialog.
  async applyChanges(clickTimeout?: number): Promise<void> {
    await this.applyButton.click({ timeout: clickTimeout });
    await new OtelActionDialog(this.page, 'apply', this.teamName).confirm(clickTimeout);
  }

  async openApplyDialog(clickTimeout?: number): Promise<OtelActionDialog> {
    await this.applyButton.click({ timeout: clickTimeout });
    return new OtelActionDialog(this.page, 'apply', this.teamName);
  }
}

export class OtelPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.otel);
  }

  async openWithCreateIntent(projectName: string): Promise<void> {
    await this.visit(`${PATHS.otel}?project=${encodeURIComponent(projectName)}&create=true`);
  }

  // Serves the real connections list with the team's row flagged as needing Apply; no writes reach the backend.
  async routeRestartRequired(teamName: string): Promise<void> {
    await this.page.route(
      (url) => url.pathname === CONNECTIONS_API_PATH,
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        const rows: ListedConnection[] = await response.json();
        const body = rows.map(({ managedSettings: _managedSettings, ...row }) =>
          row.connection.teamName === teamName ? { ...row, restartRequired: true } : row,
        );
        return route.fulfill({ response, json: body });
      },
    );
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.otel);
  }

  get ready(): Locator {
    return this.generateButton;
  }

  get generateButton(): Locator {
    return this.page.getByRole('button', { name: OTEL_COPY.generate, exact: true });
  }

  async openCredentialDialog(): Promise<OtelCredentialDialog> {
    await this.generateButton.click();
    return new OtelCredentialDialog(this.page);
  }

  get credentialDialog(): OtelCredentialDialog {
    return new OtelCredentialDialog(this.page);
  }

  get snippetDialog(): OtelSnippetDialog {
    return new OtelSnippetDialog(this.page);
  }

  rotateDialog(teamName: string): OtelActionDialog {
    return new OtelActionDialog(this.page, 'rotate', teamName);
  }

  applyDialog(teamName: string): OtelActionDialog {
    return new OtelActionDialog(this.page, 'apply', teamName);
  }

  finalizeDialog(teamName: string): OtelActionDialog {
    return new OtelActionDialog(this.page, 'finalize', teamName);
  }

  revokeDialog(teamName: string): OtelActionDialog {
    return new OtelActionDialog(this.page, 'revoke', teamName);
  }

  removeDialog(teamName: string): OtelActionDialog {
    return new OtelActionDialog(this.page, 'hide', teamName);
  }

  get openDialogs(): Locator {
    return this.page.getByRole('dialog');
  }

  connectionRow(teamName: string): OtelConnectionRow {
    return new OtelConnectionRow(this.page, teamName);
  }

  // Every row of the connections table that contains the team's row.
  connectionRows(teamName: string): Locator {
    return tableRows(tableWithRow(this.page, teamName));
  }

  // The team name and organization shown in a connections table row.
  async rowSummary(row: Locator): Promise<{ teamName: string; organization: string }> {
    const table = this.page.getByRole('table', { name: OTEL_COPY.connections.tableLabel, exact: true });
    const teamCell = await columnCell(table, row, OTEL_COPY.connections.columns.team);
    const teamName = (await teamCell.innerText()).split('\n')[0].trim();
    return {
      teamName,
      organization: await cellFullText(await columnCell(table, row, OTEL_COPY.connections.columns.organization)),
    };
  }

  get policyHeading(): Locator {
    return this.page.getByRole('heading', { name: OTEL_COPY.policy.title });
  }

  private get policySection(): Locator {
    return this.page.getByRole('region', { name: OTEL_COPY.policy.title, exact: true });
  }

  policyCells(name: string): Locator {
    return this.policySection.getByRole('cell', { name, exact: true });
  }

  policyMetricFamily(name: string): Locator {
    return this.policySection.getByRole('cell', { name, exact: true }).first();
  }

  get policyControls(): Locator {
    return this.policySection.locator('select, .ant-select, input[type="radio"], input[type="checkbox"]');
  }

  get ingestionHeading(): Locator {
    return this.page.getByRole('heading', { name: OTEL_COPY.health.title, exact: true });
  }

  healthStatus(state: IngestionState): Locator {
    return this.page.getByText(OTEL_COPY.health.state[state], { exact: true });
  }

  healthMessage(message: string): Locator {
    return this.page.getByText(message);
  }

  get firstPayloadButton(): Locator {
    return this.page.getByRole('button', { name: FIRST_PAYLOAD_BUTTON_NAME }).first();
  }

  get payloadDrawer(): Locator {
    return this.page.getByRole('dialog', { name: OTEL_COPY.health.payloadTitle, exact: true });
  }

  async openFirstPayload(): Promise<void> {
    await this.firstPayloadButton.click();
  }

  async closePayloadWithEscape(): Promise<void> {
    await this.payloadDrawer.press('Escape');
  }
}
