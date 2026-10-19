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

import { expect, Locator, Page } from '@playwright/test';

import { COMMON_COPY, OTEL_MODAL_COPY, OTEL_REPLAY_KIND, REPLAY_COPY, type OtelReplayKind } from '../app-copy';

import { columnCell, tableRows } from './common';

const PICKER_INPUTS = '.ant-picker-range input';
const OPEN_PICKER_PANEL = '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)';
const DISABLED_CELL = 'ant-picker-cell-disabled';

// The antd range picker of a rebuild dialog: days are typed as YYYY-MM-DD and committed with Enter.
class ReplayRangePicker {
  constructor(
    private readonly page: Page,
    private readonly dialog: Locator,
  ) {}

  private get inputs(): Locator {
    return this.dialog.locator(PICKER_INPUTS);
  }

  async setRange(start: string, end: string): Promise<void> {
    await this.inputs.first().fill(start);
    await this.page.keyboard.press('Enter');
    await this.inputs.last().fill(end);
    await this.page.keyboard.press('Enter');
  }

  // Opens the calendar on the month of the day so its cell is on screen.
  async showDay(day: string): Promise<void> {
    await this.inputs.first().click();
    await this.inputs.first().fill(day);
  }

  private dayCell(day: string, state: string): Locator {
    return this.page.locator(`${OPEN_PICKER_PANEL} td.ant-picker-cell-in-view${state}[title="${day}"]`);
  }

  blockedDay(day: string): Locator {
    return this.dayCell(day, `.${DISABLED_CELL}`);
  }

  pickableDay(day: string): Locator {
    return this.dayCell(day, `:not(.${DISABLED_CELL})`);
  }

  async closePicker(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }
}

// The "Change organization" form of a connection row and its confirmation.
export class OtelRebindDialog {
  private readonly picker: ReplayRangePicker;

  constructor(
    private readonly page: Page,
    private readonly teamName: string,
  ) {
    this.picker = new ReplayRangePicker(page, this.dialog);
  }

  get dialog(): Locator {
    return this.page.getByRole('dialog', { name: OTEL_MODAL_COPY.rebind.title, exact: true });
  }

  get organizationInput(): Locator {
    return this.dialog.getByPlaceholder(OTEL_MODAL_COPY.rebind.field.placeholder);
  }

  get rebuildCheckbox(): Locator {
    return this.dialog.getByRole('checkbox', { name: OTEL_MODAL_COPY.rebind.rebuild, exact: true });
  }

  get continueButton(): Locator {
    return this.dialog.getByRole('button', { name: OTEL_MODAL_COPY.rebind.submit, exact: true });
  }

  get revokedNotice(): Locator {
    return this.dialog.getByText(OTEL_MODAL_COPY.rebind.revoked, { exact: true });
  }

  get disabledReasonTooltip(): Locator {
    return this.page.getByRole('tooltip');
  }

  get confirmDialog(): Locator {
    return this.page.getByRole('dialog', { name: OTEL_MODAL_COPY.rebind.confirm.title(this.teamName), exact: true });
  }

  get confirmButton(): Locator {
    return this.confirmDialog.getByRole('button', { name: OTEL_MODAL_COPY.rebind.confirm.confirm, exact: true });
  }

  async fillOrganization(organizationId: string): Promise<void> {
    await this.organizationInput.fill(organizationId);
  }

  async toggleRebuild(): Promise<void> {
    await this.rebuildCheckbox.click();
  }

  async setRange(start: string, end: string): Promise<void> {
    await this.picker.setRange(start, end);
  }

  async continue(): Promise<void> {
    await this.continueButton.click();
  }

  async showDisabledReason(): Promise<void> {
    await this.continueButton.hover();
  }

  async typeSlug(slug: string): Promise<void> {
    await this.confirmDialog.getByLabel(OTEL_MODAL_COPY.rebind.confirm.slug(slug)).fill(slug);
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.dialog.getByRole('button', { name: COMMON_COPY.cancel, exact: true }).click();
  }

  async closeWithEscape(): Promise<void> {
    await this.page.mouse.move(0, 0);
    await expect(this.disabledReasonTooltip).toHaveCount(0);
    await this.page.keyboard.press('Escape');
  }
}

// The "Rebuild data (all teams)" form opened from the rebuilds section, and its confirmation.
export class OtelReplayDialog {
  private readonly picker: ReplayRangePicker;

  constructor(private readonly page: Page) {
    this.picker = new ReplayRangePicker(page, this.dialog);
  }

  get dialog(): Locator {
    return this.page.getByRole('dialog', { name: OTEL_MODAL_COPY.replayModal.title, exact: true });
  }

  get confirmDialog(): Locator {
    return this.page.getByRole('dialog', { name: OTEL_MODAL_COPY.replayModal.confirm.title(), exact: true });
  }

  async open(): Promise<void> {
    await this.page
      .getByRole('region', { name: REPLAY_COPY.title, exact: true })
      .getByRole('button', { name: REPLAY_COPY.rebuild, exact: true })
      .click();
  }

  async setRange(start: string, end: string): Promise<void> {
    await this.picker.setRange(start, end);
  }

  async submit(): Promise<void> {
    await this.dialog.getByRole('button', { name: OTEL_MODAL_COPY.replayModal.submit, exact: true }).click();
  }

  async confirm(): Promise<void> {
    await this.confirmDialog
      .getByRole('button', { name: OTEL_MODAL_COPY.replayModal.confirm.confirm, exact: true })
      .click();
  }

  async showDay(day: string): Promise<void> {
    await this.picker.showDay(day);
  }

  blockedDay(day: string): Locator {
    return this.picker.blockedDay(day);
  }

  pickableDay(day: string): Locator {
    return this.picker.pickableDay(day);
  }

  async closePicker(): Promise<void> {
    await this.picker.closePicker();
  }
}

// The "Data rebuilds" section and its server-paginated table.
export class OtelRebuildsTable {
  constructor(private readonly page: Page) {}

  get section(): Locator {
    return this.page.getByRole('region', { name: REPLAY_COPY.title, exact: true });
  }

  private get table(): Locator {
    return this.section.getByRole('table', { name: REPLAY_COPY.tableLabel, exact: true });
  }

  get rows(): Locator {
    return tableRows(this.table);
  }

  private get countBadge(): Locator {
    return this.section
      .getByRole('heading', { name: REPLAY_COPY.title, exact: true })
      .locator('xpath=following-sibling::span');
  }

  async total(): Promise<number> {
    return Number(await this.countBadge.innerText());
  }

  rowFor(days: string, kind: OtelReplayKind = OTEL_REPLAY_KIND.METRICS): Locator {
    return this.rows
      .filter({ has: this.page.getByText(days, { exact: true }) })
      .filter({ has: this.page.getByText(REPLAY_COPY.kind[kind], { exact: true }) });
  }

  async stateOf(row: Locator): Promise<Locator> {
    return columnCell(this.table, row, REPLAY_COPY.columns.status);
  }

  async requestedFor(row: Locator): Promise<Locator> {
    return columnCell(this.table, row, REPLAY_COPY.columns.requestedFor);
  }

  async nextPage(): Promise<void> {
    await this.section.locator('.ant-pagination-next:not(.ant-pagination-disabled) button').click();
  }
}
