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

import {
  BasePage,
  Screen,
  cellFullText,
  modalWithText,
  selectBox,
  selectOption,
  tableRow,
  tableRows,
  tableWithRow,
  urlEndingWith,
} from './common';
import { PATHS } from './paths';

const rowCells = (row: Locator): Locator => row.locator('td');

const modalCloseButton = (modal: Locator): Locator => modal.locator('.ant-modal-close');

// The "Generate Claude Settings" form.
export class OtelCredentialDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return modalWithText(this.page, /Generate Claude Settings/i);
  }

  get bindingNotice(): Locator {
    return this.dialog.getByText(/This connection binds to the first Anthropic organization UUID it receives/i);
  }

  get submitButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Generate' });
  }

  async fillTeamName(teamName: string): Promise<void> {
    await this.dialog.getByPlaceholder('Platform Engineering').fill(teamName);
  }

  // Picks the project by typing its name into the select, then closes the dropdown through the dialog heading.
  async selectProject(projectName: string): Promise<void> {
    await selectBox(this.dialog).click();
    await this.page.keyboard.type(projectName);
    await selectOption(this.page, projectName).click();
    await this.dialog.getByText('Generate Claude Settings').click();
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}

// The one-time "Claude managed settings" snippet shown after a credential is generated or rotated.
export class OtelSnippetDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return modalWithText(this.page, /Claude managed settings/i);
  }

  get storageNotice(): Locator {
    return this.dialog.getByText(/DevLake does not store the generated password or Basic Auth header/i);
  }

  get code(): Locator {
    return this.dialog.locator('pre, code, textarea').first();
  }

  async close(): Promise<void> {
    await modalCloseButton(this.dialog).click();
  }
}

// A confirmation dialog of a credential lifecycle action (apply, rotate, finalize, revoke, remove).
export class OtelActionDialog {
  constructor(
    private readonly page: Page,
    private readonly title: RegExp,
    private readonly confirmName: string,
  ) {}

  get dialog(): Locator {
    return modalWithText(this.page, this.title);
  }

  async confirm(clickTimeout?: number): Promise<void> {
    await this.dialog.getByRole('button', { name: this.confirmName }).click({ timeout: clickTimeout });
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

  get pendingFirstTelemetry(): Locator {
    return this.root.getByText('Pending first telemetry');
  }

  get ready(): Locator {
    return this.root.getByText('Ready');
  }

  get active(): Locator {
    return this.root.getByText('active');
  }

  get retiring(): Locator {
    return this.root.getByText('retiring');
  }

  get revokedStatus(): Locator {
    return this.root.getByText('Revoked', { exact: true });
  }

  get revokedTag(): Locator {
    return this.root.getByText('revoked', { exact: true });
  }

  get rotateButton(): Locator {
    return this.root.getByRole('button', { name: /Rotate/i });
  }

  get finalizeButton(): Locator {
    return this.root.getByRole('button', { name: /Finalize/i });
  }

  get revokeButton(): Locator {
    return this.root.getByRole('button', { name: /Revoke/i });
  }

  get removeButton(): Locator {
    return this.root.getByRole('button', { name: /Remove/i });
  }

  get applyButton(): Locator {
    return this.root.getByRole('button', { name: /Apply/i });
  }

  async organization(): Promise<string> {
    return cellFullText(rowCells(this.root).nth(3));
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

  // Applies pending credential changes: opens the row action and confirms its dialog.
  async applyChanges(clickTimeout?: number): Promise<void> {
    await this.applyButton.click({ timeout: clickTimeout });
    await new OtelActionDialog(this.page, /Apply Credential Changes/i, 'Apply').confirm(clickTimeout);
  }
}

export class OtelPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.otel);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.otel);
  }

  get ready(): Locator {
    return this.page.getByRole('button', { name: /Generate Claude Settings/ });
  }

  get generateButton(): Locator {
    return this.page.getByRole('button', { name: /Generate Claude Settings/i });
  }

  async openCredentialDialog(): Promise<OtelCredentialDialog> {
    await this.generateButton.click();
    return new OtelCredentialDialog(this.page);
  }

  get snippetDialog(): OtelSnippetDialog {
    return new OtelSnippetDialog(this.page);
  }

  get rotateDialog(): OtelActionDialog {
    return new OtelActionDialog(this.page, /Rotate Claude Code OTel Credential/i, 'Rotate');
  }

  get finalizeDialog(): OtelActionDialog {
    return new OtelActionDialog(this.page, /Finalize Rotation/i, 'Finalize');
  }

  get revokeDialog(): OtelActionDialog {
    return new OtelActionDialog(this.page, /Revoke Claude Code OTel Credential/i, 'Revoke');
  }

  get removeDialog(): OtelActionDialog {
    return new OtelActionDialog(this.page, /Remove Revoked Connection/i, 'Remove');
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
    const cells = rowCells(row);
    const teamName = (await cells.nth(0).innerText()).trim();
    return { teamName, organization: await cellFullText(cells.nth(3)) };
  }

  get policyHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Canonical daily data' });
  }

  private get policySection(): Locator {
    return this.page.locator('.ant-flex').filter({ has: this.policyHeading }).last();
  }

  policyCells(name: string): Locator {
    return this.policySection.getByRole('cell', { name, exact: true });
  }

  policyMetricFamily(name: string): Locator {
    return this.policySection.getByRole('rowheader', { name }).first();
  }

  get policyControls(): Locator {
    return this.policySection.locator('select, .ant-select, input[type="radio"], input[type="checkbox"]');
  }

  get ingestionHeading(): Locator {
    return this.page.getByText('Telemetry ingestion');
  }

  healthStatus(status: string): Locator {
    return this.page.getByText(status, { exact: true });
  }

  healthMessage(message: string): Locator {
    return this.page.getByText(message);
  }
}
