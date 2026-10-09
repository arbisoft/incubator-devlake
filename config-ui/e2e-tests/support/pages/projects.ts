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

import { PROJECT_HOME_COPY as COPY } from '../app-copy';

import {
  BasePage,
  Screen,
  urlEndingWith,
  cronFieldInputs,
  firstCellTexts,
  iconButton,
  paginationPage,
  pipelineRowById,
  sectionHeaderButton,
  selectOption,
  tableRow,
} from './common';
import { PATHS, PROJECT_TABS, ProjectTabKey } from './paths';

// Outer project tab labels, keyed by their URL segment.
const PROJECT_TAB_LABEL: Record<ProjectTabKey, string> = {
  blueprint: 'Blueprint',
  webhooks: 'Webhooks',
  'claude-code-otel': 'Claude Code OTel',
  settings: 'Settings',
};

export class ProjectsPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.projects);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.projects);
  }

  get ready(): Locator {
    return this.page.getByRole('button', { name: COPY.newProject });
  }

  async openWithQuery(query: string): Promise<void> {
    await this.visit(`${PATHS.projects}?${query}`);
  }

  async createProject(name: string): Promise<void> {
    await this.ready.click();
    const dialog = this.dialog(COPY.create.title);
    await dialog.getByRole('textbox', { name: COPY.create.name.label }).fill(name);
    await dialog.getByRole('button', { name: COPY.create.submit }).click();
  }

  async search(name: string): Promise<void> {
    const box = this.page.getByRole('textbox', { name: COPY.searchPlaceholder });
    await box.fill(name);
    await box.press('Enter');
  }

  noResults(): Locator {
    return this.page.getByRole('heading', { name: COPY.noResults.title });
  }

  async sortByColumn(label: string): Promise<void> {
    await this.page.getByRole('columnheader', { name: label }).click();
  }

  async goToListPage(number: number): Promise<void> {
    await paginationPage(this.page, number).click();
  }

  projectNames(): Promise<string[]> {
    return firstCellTexts(this.page);
  }

  projectRow(name: string): Locator {
    return this.row(name);
  }

  async openProject(name: string): Promise<void> {
    await this.projectRow(name).getByRole('link', { name, exact: true }).click();
  }
}

export class ProjectPage extends BasePage {
  constructor(
    page: Page,
    private readonly projectName: string,
  ) {
    super(page);
  }

  async open(): Promise<void> {
    await this.visit(PATHS.project(this.projectName));
  }

  // The bare project URL redirects to its first tab.
  get urlPattern(): RegExp {
    return this.tabUrlPattern('blueprint');
  }

  get tabs(): readonly ProjectTabKey[] {
    return PROJECT_TABS;
  }

  async openAtTab(tab: ProjectTabKey, query = ''): Promise<void> {
    await this.visit(`${PATHS.projectTab(this.projectName, tab)}${query}`);
  }

  tabUrlPattern(tab: ProjectTabKey): RegExp {
    return new RegExp(`${PATHS.projectTab(this.projectName, tab)}$`);
  }

  tabFor(tab: ProjectTabKey): Locator {
    return this.tab(PROJECT_TAB_LABEL[tab]);
  }

  get nameLink(): Locator {
    return this.page.getByRole('link', { name: this.projectName });
  }

  dataScopeCount(count: number): Locator {
    return this.page.getByText(`${count} data scope`);
  }

  connectionLabel(connectionName: string): Locator {
    return this.page.getByText(connectionName);
  }

  async addConnectionWithScope(connectionName: string, scopeFullName: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Add a Connection' }).click();
    const dialog = this.dialog(/Add a Connection/);
    await dialog.getByRole('combobox').click();
    await selectOption(this.page, connectionName).click();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByText(scopeFullName, { exact: true }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
  }

  async openSyncPolicy(): Promise<void> {
    await sectionHeaderButton(this.page, 'Sync Policy').click();
  }

  // Picks the last 30 days, a custom cron of "<minute> <hour> * * *", and skip-on-failure in the open sync policy dialog.
  async fillSyncPolicy(minute: string, hour: string): Promise<void> {
    const dialog = this.dialog('Set Sync Policy');
    await dialog.getByText('Last 30 days').click();
    await dialog.getByRole('radio', { name: 'Custom' }).check();
    const fields = cronFieldInputs(dialog);
    await fields.nth(0).fill(minute);
    await fields.nth(1).fill(hour);
    await dialog.getByRole('checkbox').check();
  }

  async saveSyncPolicy(): Promise<void> {
    await this.dialog('Set Sync Policy').getByRole('button', { name: 'Save' }).click();
  }

  async collectData(): Promise<void> {
    await this.page.getByRole('button', { name: 'Collect Data' }).click();
  }

  get currentPipelineLabel(): Locator {
    return this.page.getByText('Current Pipeline');
  }

  pipelineRow(id: number): Locator {
    return pipelineRowById(this.page, id);
  }

  get webhookDialog(): Locator {
    return this.dialog('Add a New Webhook');
  }

  get webhookCurlNotice(): Locator {
    return this.webhookDialog.getByText('CURL commands generated. Please copy them now.');
  }

  async generateWebhook(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Add a Webhook' }).click();
    await this.webhookDialog.getByPlaceholder('Webhook Name').fill(name);
    await this.webhookDialog.getByRole('button', { name: 'Generate POST URL' }).click();
  }

  async closeWebhookDialog(): Promise<void> {
    await this.webhookDialog.getByRole('button', { name: 'Close' }).click();
  }

  webhookRow(name: string): Locator {
    return tableRow(this.page, name);
  }

  // Deletes the webhook through its row and returns the HTTP status of the delete request.
  async deleteWebhook(name: string, webhookId: number): Promise<number> {
    await iconButton(this.webhookRow(name), 'delete').click();
    const deleted = this.page.waitForResponse(
      (res) => res.url().endsWith(`/plugins/webhook/connections/${webhookId}`) && res.request().method() === 'DELETE',
    );
    await this.confirmDialog('Delete this Webhook?');
    return (await deleted).status();
  }

  async deleteProject(): Promise<void> {
    await this.page.getByRole('button', { name: 'Delete Project' }).click();
    await this.confirmDialog('Are you sure you want to delete this Project?');
  }
}
