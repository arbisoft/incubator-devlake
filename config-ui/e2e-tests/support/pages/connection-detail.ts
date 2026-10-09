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
  DATA_SCOPE_REMOTE_COPY,
  DETAIL_COPY,
  SCOPE_CONFIG_COPY,
  SCOPE_CONFIG_FORM_COPY,
  SCOPE_CONFIG_SELECT_COPY,
  SCOPE_TABLE_COPY,
} from '../app-copy';

import { BasePage, tableRow, tagWithText } from './common';
import type { PluginRef } from './connections';
import { PATHS } from './paths';

export class ConnectionDetailPage extends BasePage {
  constructor(
    page: Page,
    private readonly plugin: PluginRef,
  ) {
    super(page);
  }

  get urlPattern(): RegExp {
    return new RegExp(`/connections/${this.plugin.key}/\\d+$`);
  }

  async open(id: number): Promise<void> {
    await this.visit(PATHS.connection(this.plugin.key, id));
  }

  idFromUrl(): number {
    return Number(new URL(this.page.url()).pathname.split('/').pop());
  }

  // The connection name is the page heading, which the spec reads as the name shown for a saved connection.
  nameLink(name: string): Locator {
    return this.heading.filter({ hasText: name });
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  // Asks to delete the connection and confirms; the dialog names the connection shown in the heading.
  async deleteConnection(): Promise<void> {
    const name = (await this.heading.innerText()).trim();
    await this.page.getByRole('button', { name: DETAIL_COPY.deleteConnection }).click();
    await this.confirmDialog(DETAIL_COPY.confirm.connection.title(name), DETAIL_COPY.confirm.connection.confirm);
  }

  get conflictDialog(): Locator {
    return this.dialog(DETAIL_COPY.conflict.connection.title);
  }

  conflictNames(): Locator {
    return this.conflictDialog.getByRole('listitem');
  }

  async search(text: string): Promise<void> {
    const box = this.page.getByRole('textbox', { name: DETAIL_COPY.searchPlaceholder });
    await box.fill(text);
    await box.press('Enter');
  }

  async selectScope(fullName: string): Promise<void> {
    await this.scopeRow(fullName).getByRole('checkbox').check();
  }

  get bulkDeleteButton(): Locator {
    return this.page.getByRole('button', { name: DETAIL_COPY.deleteScopes });
  }

  get bulkDialog(): Locator {
    return this.dialog(DETAIL_COPY.bulk.title);
  }

  // Confirms the bulk delete for the given number of selected scopes and waits for the progress dialog to finish.
  async deleteSelectedScopes(count: number): Promise<void> {
    await this.bulkDeleteButton.click();
    const { title, confirm } = DETAIL_COPY.confirm.scopesBulk;
    await this.confirmDialog(title(count), confirm);
  }

  bulkSucceeded(count: number): Locator {
    return this.bulkDialog.getByText(`${DETAIL_COPY.bulk.succeeded}: ${count}`);
  }

  async closeBulkResult(): Promise<void> {
    await this.bulkDialog.getByRole('button', { name: DETAIL_COPY.bulk.close }).click();
  }

  scopeRow(fullName: string): Locator {
    return this.row(fullName);
  }

  scopeConfigCell(fullName: string, configName: string): Locator {
    return this.scopeRow(fullName).getByText(configName);
  }

  get addScopeDialog(): Locator {
    return this.dialog('Add Data Scope');
  }

  async openAddScope(): Promise<void> {
    await this.page.getByRole('button', { name: DETAIL_COPY.addScope }).click();
  }

  async searchRemoteScope(text: string): Promise<void> {
    await this.addScopeDialog.getByPlaceholder(DATA_SCOPE_REMOTE_COPY.searchFallback).fill(text);
  }

  async pickRemoteScope(fullName: string): Promise<void> {
    await this.addScopeDialog.getByText(fullName, { exact: true }).click();
  }

  pickedScopeTag(fullName: string): Locator {
    return tagWithText(this.addScopeDialog, fullName);
  }

  async saveAddScope(): Promise<void> {
    await this.addScopeDialog.getByRole('button', { name: DATA_SCOPE_REMOTE_COPY.submit, exact: true }).click();
  }

  async openAssociateScopeConfig(scopeFullName: string): Promise<void> {
    await this.scopeRow(scopeFullName).getByRole('button', { name: SCOPE_CONFIG_COPY.associate, exact: true }).click();
  }

  get associateDialog(): Locator {
    return this.dialog(DETAIL_COPY.associateTitle);
  }

  // Creates a scope config with default entities from the associate dialog.
  async createScopeConfig(name: string): Promise<void> {
    await this.associateDialog.getByRole('button', { name: SCOPE_CONFIG_SELECT_COPY.add }).click();
    const form = this.dialog(SCOPE_CONFIG_SELECT_COPY.addTitle);
    await form.getByPlaceholder(SCOPE_CONFIG_FORM_COPY.name.placeholder).fill(name);
    await form.getByRole('button', { name: SCOPE_CONFIG_FORM_COPY.next, exact: true }).click();
    await form.getByRole('button', { name: SCOPE_CONFIG_FORM_COPY.save, exact: true }).click();
  }

  associateScopeConfigRow(name: string): Locator {
    return tableRow(this.associateDialog, name);
  }

  async saveAssociateScopeConfig(): Promise<void> {
    await this.associateDialog.getByRole('button', { name: SCOPE_CONFIG_SELECT_COPY.save, exact: true }).click();
  }

  async removeScope(fullName: string): Promise<void> {
    await this.scopeRow(fullName)
      .getByRole('button', { name: SCOPE_TABLE_COPY.deleteScope(fullName), exact: true })
      .click();
    const { title, confirm } = DETAIL_COPY.confirm.scopeDelete;
    await this.confirmDialog(title(fullName), confirm);
  }
}
