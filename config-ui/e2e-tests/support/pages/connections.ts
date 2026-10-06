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

import { BasePage, Screen, urlEndingWith, iconButton, tableRow, tagWithText } from './common';
import { PATHS } from './paths';

export const catalogCard = (page: Page, name: string): Locator =>
  page.locator('li').filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

// A plugin's catalog display name and its key in API paths.
export interface PluginRef {
  name: string;
  key: string;
}

export const PLUGINS = {
  github: { name: 'GitHub', key: 'github' },
  claudeCode: { name: 'Claude Code', key: 'claude_code' },
} satisfies Record<string, PluginRef>;

const manageTitle = (plugin: PluginRef) => `Manage Connections: ${plugin.name}`;

// The create or edit form of a plugin connection, shown inside its "Manage Connections" dialog.
export class ConnectionForm {
  constructor(
    private readonly page: Page,
    private readonly pluginKey: string,
    readonly dialog: Locator,
  ) {}

  get validFrom(): Locator {
    return this.dialog.getByText(/Valid From:/);
  }

  async fillName(name: string): Promise<void> {
    await this.dialog.getByPlaceholder('Your Connection Name').fill(name);
  }

  async clickNameField(): Promise<void> {
    await this.dialog.getByPlaceholder('Your Connection Name').click();
  }

  async fillToken(token: string): Promise<void> {
    await this.dialog.getByPlaceholder('Token').fill(token);
  }

  async fillOrganization(organization: string): Promise<void> {
    await this.dialog.getByPlaceholder('e.g. org_123456789').fill(organization);
  }

  async addHeader(index: number, key: string, value: string): Promise<void> {
    await this.dialog.getByRole('button', { name: '+ Add Header' }).click();
    await this.dialog.getByPlaceholder('Header name').nth(index).fill(key);
    await this.dialog.getByPlaceholder('Header value').nth(index).fill(value);
  }

  async test(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Test Connection' }).click();
  }

  // Clicks Test Connection and returns the HTTP status of the plugin's test request.
  async testAndGetStatus(): Promise<number> {
    const testResponse = this.page.waitForResponse(
      (res) => res.url().endsWith(`/plugins/${this.pluginKey}/test`) && res.request().method() === 'POST',
    );
    await this.test();
    return (await testResponse).status();
  }

  async save(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Save Connection' }).click();
  }
}

export class ConnectionsPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.connections);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.connections);
  }

  get ready(): Locator {
    return this.heading;
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Connections', level: 1 });
  }

  get dataConnectionsHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Data Connections', exact: true });
  }

  get webhooksHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Webhooks', exact: true });
  }

  card(name: string): Locator {
    return catalogCard(this.page, name);
  }

  get cardNames(): Locator {
    return this.page.locator('li .name');
  }

  cardCount(name: string): Locator {
    return this.card(name).locator('.count');
  }

  async openCard(name: string): Promise<void> {
    await this.card(name).click();
  }

  manageDialog(plugin: PluginRef): Locator {
    return this.dialog(manageTitle(plugin));
  }

  connectionRow(plugin: PluginRef, name: string): Locator {
    return tableRow(this.manageDialog(plugin), name);
  }

  async openCreateForm(plugin: PluginRef): Promise<ConnectionForm> {
    await this.open();
    await this.openCard(plugin.name);
    await this.manageDialog(plugin).getByRole('button', { name: 'Create a New Connection' }).click();
    return new ConnectionForm(this.page, plugin.key, this.manageDialog(plugin));
  }

  // Opens the edit form of a saved connection once its detail has been refetched.
  async openEditForm(plugin: PluginRef, id: number, name: string): Promise<ConnectionForm> {
    const detailLoaded = this.page.waitForResponse(
      (res) => res.url().endsWith(`/plugins/${plugin.key}/connections/${id}`) && res.request().method() === 'GET',
    );
    await this.connectionRow(plugin, name).getByRole('button', { name: 'Edit' }).click();
    await detailLoaded;
    return new ConnectionForm(this.page, plugin.key, this.manageDialog(plugin).last());
  }
}

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
