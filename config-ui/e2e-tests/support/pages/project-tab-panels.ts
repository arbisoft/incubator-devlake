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
import { Locator } from '@playwright/test';

import { PROJECT_DETAIL_COPY as COPY, WEBHOOK_COPY } from '../app-copy';

import { BasePage, tableRow } from './common';

const SETTINGS_COPY = COPY.settings;

export class ProjectSettings extends BasePage {
  constructor(
    page: ConstructorParameters<typeof BasePage>[0],
    private readonly projectName: string,
  ) {
    super(page);
  }

  get nameInput(): Locator {
    return this.page.getByRole('textbox', { name: SETTINGS_COPY.name.label });
  }

  async rename(newName: string): Promise<void> {
    await this.nameInput.fill(newName);
    await this.save();
  }

  private checkbox(label: string): Locator {
    return this.page.getByRole('checkbox', { name: label, exact: true });
  }

  get dora(): Locator {
    return this.checkbox(SETTINGS_COPY.dora.label);
  }

  get linker(): Locator {
    return this.checkbox(SETTINGS_COPY.linker.label);
  }

  get issueTrace(): Locator {
    return this.checkbox(SETTINGS_COPY.issueTrace.label);
  }

  get linkerRegexp(): Locator {
    return this.page.getByRole('textbox', { name: SETTINGS_COPY.linker.regexLabel });
  }

  async fillLinkerRegexp(value: string): Promise<void> {
    await this.linkerRegexp.fill(value);
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: SETTINGS_COPY.save }).click();
  }

  get discardButton(): Locator {
    return this.page.getByRole('button', { name: SETTINGS_COPY.discard });
  }

  async discard(): Promise<void> {
    await this.discardButton.click();
  }

  get deleteDialog(): Locator {
    return this.dialog(SETTINGS_COPY.delete.title(this.projectName));
  }

  get deleteButton(): Locator {
    return this.page.getByRole('button', { name: SETTINGS_COPY.delete.open });
  }

  get deleteConfirm(): Locator {
    return this.deleteDialog.getByRole('button', { name: SETTINGS_COPY.delete.confirm });
  }

  async openDeleteDialog(): Promise<void> {
    await this.deleteButton.click();
  }

  async confirmDelete(): Promise<void> {
    await this.deleteConfirm.click();
  }

  async deleteProject(): Promise<void> {
    await this.openDeleteDialog();
    await this.confirmDelete();
  }
}

export class ProjectWebhooks extends BasePage {
  get addButton(): Locator {
    return this.page.getByRole('button', { name: WEBHOOK_COPY.add });
  }

  get selectExistingButton(): Locator {
    return this.page.getByRole('button', { name: COPY.webhooks.selectExisting });
  }

  get selectDialog(): Locator {
    return this.dialog(WEBHOOK_COPY.select.title);
  }

  async selectExisting(name: string): Promise<void> {
    await this.selectExistingButton.click();
    await this.selectDialog.getByText(name, { exact: true }).click();
    await this.selectDialog.getByRole('button', { name: WEBHOOK_COPY.select.submit }).click();
  }

  row(name: string): Locator {
    return tableRow(this.page, name);
  }
}

export class ProjectOtel extends BasePage {
  row(team: string): Locator {
    return tableRow(this.page, team);
  }

  get addButton(): Locator {
    return this.page.getByRole('button', { name: COPY.otel.add });
  }

  async add(): Promise<void> {
    await this.addButton.click();
  }

  async manage(team: string): Promise<void> {
    await this.page.getByRole('button', { name: COPY.otel.manageFor(team) }).click();
  }

  get empty(): Locator {
    return this.page.getByRole('heading', { name: COPY.otel.empty.title });
  }
}
