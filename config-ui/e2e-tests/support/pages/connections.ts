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
  CATALOG_FILTER,
  CONNECTIONS_COPY,
  HEALTH_STORAGE_KEY,
  HEALTH_TTL_MS,
  INTEGRATION_CARD_COPY,
  SORT_SELECT_COPY,
} from '../app-copy';

import { BasePage, Screen, selectOption, urlEndingWith, tableRow } from './common';
import { PATHS } from './paths';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const catalogCard = (page: Page, name: string): Locator => page.getByRole('article', { name, exact: true });

// A plugin's catalog display name and its key in API paths.
export interface PluginRef {
  name: string;
  key: string;
}

export const PLUGINS = {
  github: { name: 'GitHub', key: 'github' },
  claudeCode: { name: 'Claude Code', key: 'claude_code' },
  azureDevops: { name: 'Azure DevOps', key: 'azuredevops' },
} satisfies Record<string, PluginRef>;

const manageTitle = (plugin: PluginRef) => CONNECTIONS_COPY.manageTitle(plugin.name);

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

// A stored health entry of a connection, as the catalog keeps it in sessionStorage.
export interface StoredHealth {
  status: string;
  reason?: string;
  message?: string;
  testedAt: number;
}

const isConnectionTest = (url: string) => /\/plugins\/[^/]+\/connections\/\d+\/test$/.test(new URL(url).pathname);

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

  get deprecationNotice(): Locator {
    return this.page.getByRole('alert').filter({ hasText: CONNECTIONS_COPY.deprecationTitle });
  }

  async closeDeprecationNotice(): Promise<void> {
    await this.deprecationNotice.getByRole('button', { name: 'Close' }).click();
  }

  card(name: string): Locator {
    return catalogCard(this.page, name);
  }

  get cardNames(): Locator {
    return this.page.getByRole('article').getByRole('heading');
  }

  async cardNameList(): Promise<string[]> {
    return (await this.cardNames.allInnerTexts()).map((name) => name.trim());
  }

  get cards(): Locator {
    return this.page.getByRole('article');
  }

  get connectedCards(): Locator {
    return this.cards.filter({ hasText: /\d+ connected/ });
  }

  cardCount(name: string): Locator {
    return this.card(name).getByText(/^\d+ connected$/);
  }

  cardFailedCount(name: string): Locator {
    return this.card(name).getByText(/^\d+ failed$/);
  }

  categoryTab(category: string): Locator {
    return this.page.getByRole('tab', { name: new RegExp(`^${escapeRegExp(category)} \\(\\d+\\)$`) });
  }

  async selectCategory(category: string): Promise<void> {
    await this.categoryTab(category).click();
  }

  get searchBox(): Locator {
    return this.page.getByRole('textbox', { name: CONNECTIONS_COPY.searchPlaceholder });
  }

  async search(keyword: string): Promise<void> {
    await this.searchBox.fill(keyword);
    await this.searchBox.press('Enter');
  }

  get connectedOnlySwitch(): Locator {
    return this.page.getByRole('switch', { name: CONNECTIONS_COPY.connectedOnly });
  }

  async toggleConnectedOnly(): Promise<void> {
    await this.connectedOnlySwitch.click();
  }

  get sortSelect(): Locator {
    return this.page.getByRole('combobox', { name: SORT_SELECT_COPY.prefix });
  }

  async sortBy(label: string): Promise<void> {
    await this.sortSelect.click();
    await selectOption(this.page, label).click();
  }

  async clearFilters(): Promise<void> {
    await this.page.getByRole('button', { name: CONNECTIONS_COPY.clearFilters }).click();
  }

  get noResults(): Locator {
    return this.page.getByText(CONNECTIONS_COPY.noResults.title);
  }

  get noConnections(): Locator {
    return this.page.getByText(CONNECTIONS_COPY.empty.title);
  }

  get queryParams(): { category: string | null; connected: string | null } {
    return {
      category: this.urlParams.get(CATALOG_FILTER.CATEGORY),
      connected: this.urlParams.get(CATALOG_FILTER.CONNECTED),
    };
  }

  // Counts the connection tests the page sends from now on.
  trackConnectionTests(): { count: () => number } {
    let seen = 0;
    this.page.on('request', (request) => {
      if (request.method() === 'POST' && isConnectionTest(request.url())) seen += 1;
    });
    return { count: () => seen };
  }

  // Resolves with the response of the test request of one connection.
  waitForConnectionTest(plugin: PluginRef, id: number) {
    return this.page.waitForResponse(
      (res) => res.url().endsWith(`/plugins/${plugin.key}/connections/${id}/test`) && res.request().method() === 'POST',
    );
  }

  async waitUntilSettled(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async storedHealth(plugin: PluginRef, id: number): Promise<StoredHealth | undefined> {
    return this.page.evaluate(
      ({ key, unique }) => {
        const raw = window.sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw)[unique] as StoredHealth | undefined) : undefined;
      },
      { key: HEALTH_STORAGE_KEY, unique: `${plugin.key}-${id}` },
    );
  }

  // Moves every stored result past the validity window, as if the page had been left open for longer.
  async expireStoredHealth(): Promise<void> {
    await this.page.evaluate(
      ({ key, ttl }) => {
        const raw = window.sessionStorage.getItem(key);
        if (!raw) return;
        const entries = JSON.parse(raw) as Record<string, { testedAt: number }>;
        for (const entry of Object.values(entries)) entry.testedAt -= ttl + 1;
        window.sessionStorage.setItem(key, JSON.stringify(entries));
      },
      { key: HEALTH_STORAGE_KEY, ttl: HEALTH_TTL_MS },
    );
  }

  private async chooseFromCardMenu(name: string, item: string | RegExp): Promise<void> {
    await this.card(name)
      .getByRole('button', { name: INTEGRATION_CARD_COPY.actionsFor(name) })
      .click();
    await this.page.getByRole('menuitem', { name: item }).click();
  }

  // The manage dialog of a plugin, or the OTel page for its card, opened from the card's actions menu.
  async openCard(name: string): Promise<void> {
    await this.chooseFromCardMenu(
      name,
      new RegExp(`^(${CONNECTIONS_COPY.menu.manage}|${CONNECTIONS_COPY.menu.open})$`),
    );
  }

  // The create form of a plugin, opened from the card's actions menu (a connected card has no Add button).
  async addConnectionFromCard(name: string): Promise<void> {
    await this.chooseFromCardMenu(name, CONNECTIONS_COPY.menu.add);
  }

  connectionNameField(plugin: PluginRef): Locator {
    return this.manageDialog(plugin).getByPlaceholder('Your Connection Name');
  }

  manageButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: /^Manage \(\d+\)$/ });
  }

  addButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: INTEGRATION_CARD_COPY.add, exact: true });
  }

  manageDialog(plugin: PluginRef): Locator {
    return this.dialog(manageTitle(plugin));
  }

  connectionRow(plugin: PluginRef, name: string): Locator {
    return tableRow(this.manageDialog(plugin), name);
  }

  async openCreateForm(plugin: PluginRef): Promise<ConnectionForm> {
    await this.open();
    await this.addConnectionFromCard(plugin.name);
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

export { ConnectionDetailPage } from './connection-detail';
