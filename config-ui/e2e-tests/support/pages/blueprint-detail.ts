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
  BLUEPRINT_CONFIGURATION_COPY as CONFIG_COPY,
  BLUEPRINT_CONFIRM,
  BLUEPRINT_CONFIRM_KIND,
  BLUEPRINT_DETAIL_COPY as COPY,
  BLUEPRINT_VIEW,
  COMMON_COPY,
  DATA_SCOPE_SELECT_COPY,
  CUSTOM_CRON_FIELDS,
  SYNC_POLICY_COPY,
} from '../app-copy';

import { BasePage, Screen, chooseOption, pipelineRowById, segmentedOption } from './common';
import { PATHS } from './paths';
import {
  openPipelineRowDetail,
  pipelineDetailDialog,
  pipelineDetailOpened,
  pipelineRowMenuButton,
  pipelineTasksLabel,
} from './pipeline-table';

export type BlueprintViewKey = (typeof BLUEPRINT_VIEW)[keyof typeof BLUEPRINT_VIEW];

// The Status / Configurations switch and the Status view, which look the same under a project and under Advanced.
export class BlueprintViews extends BasePage {
  viewOption(view: BlueprintViewKey): Locator {
    return segmentedOption(this.page, COPY.views[view]);
  }

  selectedViewOption(view: BlueprintViewKey): Locator {
    return this.page.locator('.ant-segmented-item-selected').filter({ hasText: COPY.views[view] });
  }

  get syncPolicyHeading(): Locator {
    return this.page.getByRole('heading', { name: CONFIG_COPY.policy.title, exact: true });
  }

  // The sync policy section; its rows hold the time range, the frequency and skip on fail.
  get syncPolicy(): Locator {
    return this.page.getByRole('region', { name: CONFIG_COPY.policy.title, exact: true });
  }

  get nameSection(): Locator {
    return this.page.getByRole('region', { name: CONFIG_COPY.name.title, exact: true });
  }

  get editNameButton(): Locator {
    return this.page.getByRole('button', { name: CONFIG_COPY.name.edit });
  }

  async renameBlueprint(name: string): Promise<void> {
    await this.editNameButton.click();
    const dialog = this.dialog(CONFIG_COPY.name.modalTitle);
    await dialog.getByRole('textbox', { name: CONFIG_COPY.name.label }).fill(name);
    await dialog.getByRole('button', { name: CONFIG_COPY.name.submit, exact: true }).click();
  }

  get editSyncPolicyButton(): Locator {
    return this.page.getByRole('button', { name: CONFIG_COPY.policy.edit });
  }

  async openSyncPolicy(): Promise<void> {
    await this.editSyncPolicyButton.click();
  }

  get syncPolicyDialog(): Locator {
    return this.dialog(SYNC_POLICY_COPY.modal.title);
  }

  // Picks the last 30 days, a custom cron of "<minute> <hour> * * *", and skip-on-failure in the open sync policy dialog.
  async fillSyncPolicy(minute: string, hour: string): Promise<void> {
    const dialog = this.syncPolicyDialog;
    await dialog.getByText('Last 30 days').click();
    await dialog.getByRole('radio', { name: 'Custom' }).check();
    await dialog.getByRole('textbox', { name: CUSTOM_CRON_FIELDS[0] }).fill(minute);
    await dialog.getByRole('textbox', { name: CUSTOM_CRON_FIELDS[1] }).fill(hour);
    await dialog.getByRole('checkbox').check();
  }

  async saveSyncPolicy(): Promise<void> {
    await this.syncPolicyDialog.getByRole('button', { name: SYNC_POLICY_COPY.modal.submit, exact: true }).click();
  }

  get addConnectionButton(): Locator {
    return this.page.getByRole('button', { name: CONFIG_COPY.connections.add });
  }

  async addConnectionWithScope(connectionName: string, scopeFullName: string): Promise<void> {
    await this.addConnectionButton.click();
    const select = this.dialog(new RegExp(`^${CONFIG_COPY.addConnection.title}$`));
    await select.getByRole('combobox').click();
    await chooseOption(this.page, connectionName);
    await select.getByRole('button', { name: CONFIG_COPY.addConnection.next, exact: true }).click();
    const scopes = this.dialog(CONFIG_COPY.addConnection.scopesTitle);
    await scopes.getByText(scopeFullName, { exact: true }).click();
    await scopes.getByRole('button', { name: DATA_SCOPE_SELECT_COPY.save, exact: true }).click();
  }

  connectionCard(connectionName: string): Locator {
    return this.page.getByRole('article', { name: connectionName, exact: true });
  }

  async openConnectionScopes(connectionName: string): Promise<void> {
    await this.connectionCard(connectionName).getByRole('link', { name: CONFIG_COPY.connections.editScope }).click();
  }

  dataScopeCount(count: number): Locator {
    return this.page.getByText(CONFIG_COPY.connections.scopeCount(count), { exact: true });
  }

  connectionLabel(connectionName: string): Locator {
    return this.page.getByText(connectionName);
  }

  // What each view shows once it has loaded.
  viewContent(view: BlueprintViewKey): Locator {
    return view === BLUEPRINT_VIEW.STATUS ? this.currentPipelineHeading : this.syncPolicyHeading;
  }

  pipelineRow(id: number): Locator {
    return pipelineRowById(this.page, id);
  }

  pipelineDetailOpened(id: number): Locator {
    return pipelineDetailOpened(this.page, id);
  }

  pipelineDetailTasksLabel(id: number): Locator {
    return pipelineTasksLabel(this.pipelineDetailDialog(id));
  }

  async openView(view: BlueprintViewKey): Promise<void> {
    await this.viewOption(view).click();
  }

  get currentPipelineHeading(): Locator {
    return this.page.getByRole('heading', { name: COPY.panels.current });
  }

  get historicalPipelinesHeading(): Locator {
    return this.page.getByRole('heading', { name: COPY.panels.historical });
  }

  get noCurrentRun(): Locator {
    return this.page.getByText(COPY.empty.current);
  }

  get pipelineTasksLabel(): Locator {
    return pipelineTasksLabel(this.page);
  }

  get enabledSwitch(): Locator {
    return this.page.getByRole('switch');
  }

  async toggleEnabled(): Promise<void> {
    await this.enabledSwitch.click();
  }

  async requestDelete(): Promise<void> {
    await this.page.getByRole('button', { name: COPY.actions.delete, exact: true }).click();
  }

  deleteDialog(blueprintName: string): Locator {
    return this.dialog(BLUEPRINT_CONFIRM[BLUEPRINT_CONFIRM_KIND.DELETE].title(blueprintName));
  }

  async cancelDelete(blueprintName: string): Promise<void> {
    await this.deleteDialog(blueprintName).getByRole('button', { name: COMMON_COPY.cancel, exact: true }).click();
  }

  async confirmDelete(blueprintName: string): Promise<void> {
    await this.deleteDialog(blueprintName).getByRole('button', { name: COPY.actions.delete, exact: true }).click();
  }

  async collectData(): Promise<void> {
    await this.page.getByRole('button', { name: COPY.actions.collect, exact: true }).click();
  }

  rowMenuButton(id: number): Locator {
    return pipelineRowMenuButton(this.page, id);
  }

  async openPipelineDetail(id: number): Promise<void> {
    await openPipelineRowDetail(this.page, id);
  }

  pipelineDetailDialog(id: number): Locator {
    return pipelineDetailDialog(this.page, id);
  }
}

export class BlueprintDetailPage extends BlueprintViews implements Screen {
  constructor(
    page: Page,
    private readonly blueprintId: number,
  ) {
    super(page);
  }

  async open(view: BlueprintViewKey = BLUEPRINT_VIEW.STATUS): Promise<void> {
    await this.visit(
      view === BLUEPRINT_VIEW.STATUS
        ? PATHS.blueprint(this.blueprintId)
        : `${PATHS.blueprint(this.blueprintId)}/${view}`,
    );
  }

  get urlPattern(): RegExp {
    return new RegExp(`${PATHS.blueprint(this.blueprintId)}$`);
  }

  viewUrlPattern(view: BlueprintViewKey): RegExp {
    return view === BLUEPRINT_VIEW.STATUS
      ? this.urlPattern
      : new RegExp(`${PATHS.blueprint(this.blueprintId)}/${view}$`);
  }

  get ready(): Locator {
    return this.viewOption(BLUEPRINT_VIEW.STATUS);
  }
}
