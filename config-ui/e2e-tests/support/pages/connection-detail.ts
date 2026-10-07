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

import { BasePage, iconButton, tableRow, tagWithText } from './common';
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

  nameLink(name: string): Locator {
    return this.page.getByRole('link', { name });
  }

  async deleteConnection(): Promise<void> {
    await this.page.getByRole('button', { name: 'Delete Connection' }).click();
    await this.confirmDialog('Would you like to delete this Data Connection?');
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
    await this.page.getByRole('button', { name: 'Add Data Scope' }).click();
  }

  async searchRemoteScope(text: string): Promise<void> {
    await this.addScopeDialog.getByPlaceholder('Search').fill(text);
  }

  async pickRemoteScope(fullName: string): Promise<void> {
    await this.addScopeDialog.getByText(fullName, { exact: true }).click();
  }

  pickedScopeTag(fullName: string): Locator {
    return tagWithText(this.addScopeDialog, fullName);
  }

  async saveAddScope(): Promise<void> {
    await this.addScopeDialog.getByRole('button', { name: 'Save' }).click();
  }

  async openAssociateScopeConfig(scopeFullName: string): Promise<void> {
    await iconButton(this.scopeRow(scopeFullName), 'link').click();
  }

  get associateDialog(): Locator {
    return this.dialog('Associate Scope Config');
  }

  // Creates a scope config with default entities from the associate dialog.
  async createScopeConfig(name: string): Promise<void> {
    await this.associateDialog.getByRole('button', { name: 'Add New Scope Config' }).click();
    const form = this.dialog('Add Scope Config');
    await form.getByPlaceholder('My Scope Config 1').fill(name);
    await form.getByRole('button', { name: 'Next' }).click();
    await form.getByRole('button', { name: 'Save' }).click();
  }

  associateScopeConfigRow(name: string): Locator {
    return tableRow(this.associateDialog, name);
  }

  async saveAssociateScopeConfig(): Promise<void> {
    await this.associateDialog.getByRole('button', { name: 'Save' }).click();
  }

  async removeScope(fullName: string): Promise<void> {
    await iconButton(this.scopeRow(fullName), 'delete').click();
    await this.confirmDialog('Would you like to delete the selected Data Scope?');
  }
}
