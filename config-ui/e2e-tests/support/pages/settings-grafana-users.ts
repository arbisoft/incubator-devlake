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
  GRAFANA_ERROR_CODE,
  GRAFANA_USERS_COPY,
  LIST_PARAMS,
  PAGE_HEADER_COPY,
  USER_MANAGEMENT_COPY,
} from '../app-copy';

import { BasePage, chooseOption, paginationPage, segmentedOption, urlEndingWith } from './common';
import { PATHS } from './paths';

type UserManagementTab = (typeof USER_MANAGEMENT_COPY.views)[keyof typeof USER_MANAGEMENT_COPY.views];

const safeFill = async (field: Locator, value: string): Promise<void> => {
  try {
    await field.fill(value);
  } catch {
    throw new Error('A Grafana user form field could not be filled.');
  }
};

const visibleButtonWithCopy = (scope: Locator, copy: string): Locator =>
  scope.getByRole('button').filter({ has: scope.page().getByText(copy, { exact: true }) });

export class GrafanaUserRow {
  constructor(
    private readonly page: Page,
    readonly email: string,
    private readonly table: Locator,
  ) {}

  get root(): Locator {
    return this.table.getByRole('row').filter({ hasText: this.email });
  }

  get roleSelect(): Locator {
    return this.root.getByRole('combobox', { name: GRAFANA_USERS_COPY.actions.roleFor(this.email), exact: true });
  }

  get projectButton(): Locator {
    return this.root.getByRole('button', {
      name: GRAFANA_USERS_COPY.actions.editProjectsFor(this.email),
      exact: true,
    });
  }

  get moreActionsButton(): Locator {
    return this.root.getByRole('button', { name: GRAFANA_USERS_COPY.actions.moreFor(this.email), exact: true });
  }

  get disableButton(): Locator {
    return this.root.getByRole('button', { name: GRAFANA_USERS_COPY.actions.disableFor(this.email), exact: true });
  }

  get enableButton(): Locator {
    return this.root.getByRole('button', { name: GRAFANA_USERS_COPY.actions.enableFor(this.email), exact: true });
  }

  get deleteButton(): Locator {
    return this.root.getByRole('button', { name: GRAFANA_USERS_COPY.actions.deleteFor(this.email), exact: true });
  }

  async chooseRole(role: string): Promise<void> {
    await this.roleSelect.click();
    await chooseOption(this.page, role);
  }

  async openMoreAction(label: string): Promise<void> {
    await this.moreActionsButton.click();
    await this.page.getByRole('menuitem', { name: label, exact: true }).click();
  }

  async requestDisable(): Promise<void> {
    await this.disableButton.click();
  }

  async requestEnable(): Promise<void> {
    await this.enableButton.click();
  }

  async requestDelete(): Promise<void> {
    await this.deleteButton.click();
  }
}

export class GrafanaUserFormDialog {
  constructor(
    private readonly page: Page,
    readonly title: string,
    private readonly submitLabel: string,
  ) {}

  get dialog(): Locator {
    return this.page.getByRole('dialog', { name: this.title, exact: true });
  }

  field(label: string): Locator {
    return this.dialog.getByRole('textbox', { name: label, exact: true });
  }

  async fieldValue(label: string): Promise<string> {
    return this.field(label).inputValue();
  }

  get submitButton(): Locator {
    return visibleButtonWithCopy(this.dialog, this.submitLabel);
  }

  get generatePasswordButton(): Locator {
    return visibleButtonWithCopy(this.dialog, GRAFANA_USERS_COPY.password.generate);
  }

  async generatePassword(): Promise<void> {
    await this.generatePasswordButton.click();
  }

  async fillField(label: string, value: string): Promise<void> {
    await this.field(label).fill(value);
  }

  async fillPassword(value: string): Promise<void> {
    await safeFill(this.field(GRAFANA_USERS_COPY.password.label), value);
  }

  async selectRole(role: string): Promise<void> {
    await this.dialog.getByRole('combobox', { name: GRAFANA_USERS_COPY.add.role.label, exact: true }).click();
    await chooseOption(this.page, role);
  }

  async selectedProjects(): Promise<string[]> {
    const picker = this.dialog
      .locator('.ant-select')
      .filter({ has: this.page.getByRole('combobox', { name: GRAFANA_USERS_COPY.projects.label, exact: true }) });
    return picker.locator('.ant-select-selection-item').allTextContents();
  }

  async selectedRole(): Promise<string> {
    const select = this.dialog
      .locator('.ant-select')
      .filter({ has: this.page.getByRole('combobox', { name: GRAFANA_USERS_COPY.add.role.label, exact: true }) });
    return (await select.locator('.ant-select-content').innerText()).trim();
  }

  get devlakeUserPicker(): Locator {
    return this.dialog.getByRole('combobox', { name: GRAFANA_USERS_COPY.add.fillFrom.label, exact: true });
  }

  async selectDevlakeUser(search: string, optionLabel: string): Promise<void> {
    await this.devlakeUserPicker.fill(search);
    await chooseOption(this.page, optionLabel);
  }

  async clearDevlakeUser(): Promise<void> {
    await this.dialog
      .locator('.ant-select')
      .filter({ has: this.page.getByRole('combobox', { name: GRAFANA_USERS_COPY.add.fillFrom.label, exact: true }) })
      .locator('.ant-select-clear')
      .click();
  }

  async searchAndSelectProject(project: string): Promise<void> {
    const field = this.dialog.getByRole('combobox', { name: GRAFANA_USERS_COPY.projects.label, exact: true });
    await field.fill(project);
    await chooseOption(this.page, project);
    await field.press('Escape');
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async submitIsDisabled(): Promise<boolean> {
    return this.submitButton.isDisabled();
  }

  async passwordIsEmpty(): Promise<boolean> {
    return (await this.field(GRAFANA_USERS_COPY.password.label).inputValue()) === '';
  }
}

export class GrafanaProjectsDialog extends GrafanaUserFormDialog {
  constructor(page: Page) {
    super(page, GRAFANA_USERS_COPY.projects.title, GRAFANA_USERS_COPY.projects.submit);
  }
}

export class GrafanaOrphansDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole('dialog', { name: GRAFANA_USERS_COPY.orphansDialog.title, exact: true });
  }

  account(email: string): Locator {
    return this.dialog.getByText(email, { exact: true });
  }

  project(name: string): Locator {
    return this.dialog.getByText(name, { exact: true });
  }

  async clear(email: string): Promise<void> {
    await this.dialog
      .getByRole('button', { name: GRAFANA_USERS_COPY.orphansDialog.clearFor(email), exact: true })
      .click();
  }
}

export class GrafanaOneTimePasswordDialog {
  constructor(
    private readonly page: Page,
    readonly email: string,
  ) {}

  get dialog(): Locator {
    return this.page.getByRole('dialog', { name: GRAFANA_USERS_COPY.password.oneTime.title, exact: true });
  }

  get passwordField(): Locator {
    return this.dialog.getByRole('textbox', {
      name: GRAFANA_USERS_COPY.password.oneTime.passwordFor(this.email),
      exact: true,
    });
  }

  async waitUntilVisible(): Promise<boolean> {
    await this.dialog.waitFor({ state: 'visible' });
    return this.dialog.isVisible();
  }

  async isVisible(): Promise<boolean> {
    return this.dialog.isVisible();
  }

  async readPassword(): Promise<string> {
    return (await this.passwordField.inputValue()).trim();
  }

  async readAndClose(
    expected: string,
    rememberPassword: (password: string) => void,
  ): Promise<{ matches: boolean; copied: boolean }> {
    const password = await this.readPassword();
    rememberPassword(password);
    const matches = password === expected;
    const copied = await this.copyMatches(password);
    await this.close();
    return { matches, copied };
  }

  async copyMatches(expected: string): Promise<boolean> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.dialog.getByRole('button', { name: GRAFANA_USERS_COPY.password.oneTime.copy, exact: true }).click();
    try {
      return (await this.page.evaluate(() => navigator.clipboard.readText())) === expected;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.dialog.getByRole('button', { name: GRAFANA_USERS_COPY.password.oneTime.done, exact: true }).click();
  }
}

export class SettingsGrafanaUsersPage extends BasePage {
  async open(): Promise<void> {
    await this.visit(PATHS.settingsGrafanaUsers);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.settingsGrafanaUsers);
  }

  get ready(): Locator {
    return this.page.getByRole('heading', { name: USER_MANAGEMENT_COPY.title, exact: true });
  }

  get breadcrumb(): Locator {
    return this.page.getByRole('navigation', { name: PAGE_HEADER_COPY.breadcrumb, exact: true });
  }

  get grafanaTab(): Locator {
    return this.page.locator('.ant-segmented-item-selected').filter({ hasText: USER_MANAGEMENT_COPY.views.grafana });
  }

  get usersCard(): Locator {
    return this.page.getByRole('region', { name: GRAFANA_USERS_COPY.title, exact: true });
  }

  get table(): Locator {
    return this.usersCard.getByRole('table', { name: GRAFANA_USERS_COPY.tableLabel, exact: true });
  }

  get addUserButton(): Locator {
    return this.usersCard.getByRole('button', { name: GRAFANA_USERS_COPY.actions.addUser, exact: true });
  }

  get userExistsError(): Locator {
    return this.page.getByText(GRAFANA_USERS_COPY.errors[GRAFANA_ERROR_CODE.USER_EXISTS], { exact: true });
  }

  async userExistsErrorIsVisible(): Promise<boolean> {
    return this.userExistsError.isVisible();
  }

  get searchField(): Locator {
    return this.usersCard.getByRole('textbox', { name: GRAFANA_USERS_COPY.searchPlaceholder, exact: true });
  }

  get noResults(): Locator {
    return this.usersCard.getByRole('heading', { name: GRAFANA_USERS_COPY.noResults.title, exact: true });
  }

  get resultCount(): Locator {
    return this.usersCard
      .getByRole('heading', { name: GRAFANA_USERS_COPY.title, exact: true })
      .locator('..')
      .getByText(/^\d+$/);
  }

  get nextPageButton(): Locator {
    return this.usersCard.locator('.ant-pagination-next');
  }

  get currentPage(): Locator {
    return this.usersCard.locator('.ant-pagination-item-active');
  }

  orphanNotice(count: number): Locator {
    return this.usersCard.getByText(GRAFANA_USERS_COPY.orphans.notice(count), { exact: true });
  }

  get reviewOrphansButton(): Locator {
    return this.usersCard.getByRole('button', { name: GRAFANA_USERS_COPY.actions.review, exact: true });
  }

  async openTab(tab: UserManagementTab): Promise<void> {
    await segmentedOption(this.page, tab).click();
  }

  async openAddUser(): Promise<GrafanaUserFormDialog> {
    await this.addUserButton.click();
    return new GrafanaUserFormDialog(this.page, GRAFANA_USERS_COPY.add.title, GRAFANA_USERS_COPY.add.submit);
  }

  async search(keyword: string): Promise<void> {
    await this.searchField.fill(keyword);
    await this.searchField.press('Enter');
    await this.page.waitForURL((url) => (url.searchParams.get(LIST_PARAMS.KEYWORD) ?? '') === keyword.trim());
  }

  async goToPage(number: number): Promise<void> {
    await paginationPage(this.page, number).click();
  }

  async visibleUserCount(): Promise<number> {
    return (await this.table.getByRole('row').count()) - 1;
  }

  userRow(email: string): GrafanaUserRow {
    return new GrafanaUserRow(this.page, email, this.table);
  }

  async openUser(email: string): Promise<GrafanaUserRow> {
    await this.search(email);
    const row = this.userRow(email);
    await row.root.waitFor({ state: 'visible' });
    return row;
  }

  async openProjects(email: string): Promise<GrafanaProjectsDialog> {
    await (await this.openUser(email)).projectButton.click();
    return new GrafanaProjectsDialog(this.page);
  }

  async openDetails(email: string): Promise<GrafanaUserFormDialog> {
    await (await this.openUser(email)).openMoreAction(GRAFANA_USERS_COPY.actions.editDetails);
    return new GrafanaUserFormDialog(this.page, GRAFANA_USERS_COPY.details.title, GRAFANA_USERS_COPY.details.submit);
  }

  async openSetPassword(email: string): Promise<GrafanaUserFormDialog> {
    await (await this.openUser(email)).openMoreAction(GRAFANA_USERS_COPY.actions.setPassword);
    return new GrafanaUserFormDialog(
      this.page,
      GRAFANA_USERS_COPY.setPassword.title,
      GRAFANA_USERS_COPY.setPassword.submit,
    );
  }

  confirmationDialog(title: string): Locator {
    return this.page.getByRole('dialog', { name: title, exact: true });
  }

  async confirmAction(title: string, confirmLabel: string): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: title, exact: true });
    await dialog.getByRole('button', { name: confirmLabel, exact: true }).click();
  }

  async confirmEmailChange(): Promise<void> {
    await this.confirmAction(GRAFANA_USERS_COPY.details.confirm.title(), GRAFANA_USERS_COPY.details.confirm.confirm);
  }

  async confirmOrphanClear(account: string): Promise<void> {
    const config = GRAFANA_USERS_COPY.orphansDialog.confirm;
    await this.confirmAction(config.title(account), config.confirm);
  }

  async openOrphans(): Promise<GrafanaOrphansDialog> {
    await this.reviewOrphansButton.click();
    return new GrafanaOrphansDialog(this.page);
  }

  async reloadAndWait(): Promise<void> {
    await this.reload();
    await this.ready.waitFor();
    await this.table.waitFor();
  }
}
