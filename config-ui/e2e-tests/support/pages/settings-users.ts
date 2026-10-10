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

import { COMMON_COPY, SETTINGS_COPY, USER_MANAGEMENT_COPY } from '../app-copy';

import { BasePage, Screen, firstCellTexts, modalWithText, selectBox, chooseOption, urlEndingWith } from './common';
import { PATHS } from './paths';

// antd's own labels for the column filter buttons.
const ANTD_FILTER_OK = 'OK';
const ANTD_FILTER_RESET = 'Reset';

// The one-time password dialog shown after a local user is created or reset.
export class OneTimePasswordDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return modalWithText(this.page, SETTINGS_COPY.modals.temporaryPassword.hint);
  }

  get passwordInput(): Locator {
    return this.dialog.getByRole('textbox');
  }

  async readPassword(): Promise<string> {
    return (await this.passwordInput.inputValue()).trim();
  }

  async done(): Promise<void> {
    await this.dialog.getByRole('button', { name: SETTINGS_COPY.modals.temporaryPassword.done }).click();
  }
}

// The "Add local DevLake user" form.
export class LocalUserDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return modalWithText(this.page, SETTINGS_COPY.modals.addLocalUser.title);
  }

  get usernameInput(): Locator {
    return this.dialog.getByPlaceholder(SETTINGS_COPY.modals.username.placeholder);
  }

  get displayNameInput(): Locator {
    return this.dialog.getByRole('textbox', { name: SETTINGS_COPY.modals.addLocalUser.name.label, exact: true });
  }

  get createButton(): Locator {
    return this.dialog.getByRole('button', { name: SETTINGS_COPY.modals.addLocalUser.submit });
  }

  get formatError(): Locator {
    return this.page.getByText(SETTINGS_COPY.modals.invalidLoginName);
  }

  get duplicateError(): Locator {
    return this.page.getByText(/already has a DevLake (local password|access entry)/i);
  }

  async fillUsername(login: string): Promise<void> {
    await this.usernameInput.fill(login);
  }

  async fillDisplayName(displayName: string): Promise<void> {
    await this.displayNameInput.fill(displayName);
  }

  async selectRole(label: string | RegExp): Promise<void> {
    await selectBox(this.dialog).click();
    await chooseOption(this.page, label);
  }

  async create(): Promise<OneTimePasswordDialog> {
    await this.createButton.click();
    return new OneTimePasswordDialog(this.page);
  }

  async cancel(): Promise<void> {
    await this.dialog.getByRole('button', { name: COMMON_COPY.cancel }).click();
  }
}

// A row of the users table on /settings/users, with its local-password actions.
export class AccessUserRow {
  constructor(
    private readonly page: Page,
    private readonly login: string,
  ) {}

  get root(): Locator {
    return this.page
      .getByRole('region', { name: SETTINGS_COPY.users.title, exact: true })
      .getByRole('row', { name: new RegExp(this.login) });
  }

  get resetButton(): Locator {
    return this.root.getByRole('button', { name: SETTINGS_COPY.users.localPassword.resetFor(this.login), exact: true });
  }

  get disableButton(): Locator {
    return this.root.getByRole('button', { name: SETTINGS_COPY.users.disable(this.login), exact: true });
  }

  get enableButton(): Locator {
    return this.root.getByRole('button', { name: SETTINGS_COPY.users.enable(this.login), exact: true });
  }

  // Resets the local password through its confirmation dialog and returns the new one-time password dialog.
  async reset(): Promise<OneTimePasswordDialog> {
    const confirm = SETTINGS_COPY.confirm.resetPassword;
    await this.resetButton.click();
    await this.page
      .getByRole('dialog', { name: confirm.title() })
      .getByRole('button', { name: confirm.confirm })
      .click();
    return new OneTimePasswordDialog(this.page);
  }

  async disable(): Promise<void> {
    await this.disableButton.click();
  }

  async enable(): Promise<void> {
    await this.enableButton.click();
  }
}

// The /settings/users page (user management).
export class SettingsUsersPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.settingsUsers);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.settingsUsers);
  }

  get pathSegment(): string {
    return PATHS.settingsUsers;
  }

  get ready(): Locator {
    return this.page.getByRole('heading', { name: USER_MANAGEMENT_COPY.title, exact: true });
  }

  private get usersCard(): Locator {
    return this.page.getByRole('region', { name: SETTINGS_COPY.users.title, exact: true });
  }

  get directoryHeading(): Locator {
    return this.usersCard.getByRole('heading', { name: SETTINGS_COPY.users.title, exact: true });
  }

  get addLocalUserButton(): Locator {
    return this.usersCard.getByRole('button', { name: SETTINGS_COPY.users.addLocalUser, exact: true });
  }

  async openAddLocalUser(): Promise<LocalUserDialog> {
    await this.addLocalUserButton.click();
    return new LocalUserDialog(this.page);
  }

  // Fills and submits the add-local-user form, returning the one-time password dialog it opens.
  async createLocalUser(
    login: string,
    options: { displayName?: string; role?: string | RegExp } = {},
  ): Promise<OneTimePasswordDialog> {
    const form = await this.openAddLocalUser();
    await form.fillUsername(login);
    if (options.displayName !== undefined) {
      await form.fillDisplayName(options.displayName);
    }
    if (options.role !== undefined) {
      await form.selectRole(options.role);
    }
    return form.create();
  }

  async search(keyword: string): Promise<void> {
    const box = this.usersCard.getByRole('textbox', { name: SETTINGS_COPY.users.searchPlaceholder, exact: true });
    await box.fill(keyword);
    await box.press('Enter');
  }

  get statusFilterTrigger(): Locator {
    return this.usersCard
      .getByRole('columnheader')
      .filter({ has: this.page.getByText(SETTINGS_COPY.users.columns.status, { exact: true }) })
      .locator('.ant-table-filter-trigger');
  }

  private get statusFilterDropdown(): Locator {
    return this.page.locator('.ant-table-filter-dropdown');
  }

  // Picks one status in the Status column filter; the label is the visible one, e.g. "Inactive".
  async filterByStatus(label: string): Promise<void> {
    await this.statusFilterTrigger.click();
    await this.statusFilterDropdown.getByText(label, { exact: true }).click();
    await this.statusFilterDropdown.getByRole('button', { name: ANTD_FILTER_OK, exact: true }).click();
  }

  async clearStatusFilter(): Promise<void> {
    await this.statusFilterTrigger.click();
    await this.statusFilterDropdown.getByRole('button', { name: ANTD_FILTER_RESET, exact: true }).click();
    await this.statusFilterDropdown.getByRole('button', { name: ANTD_FILTER_OK, exact: true }).click();
  }

  // The email or login shown under each name in the users table.
  async userIdentities(): Promise<string[]> {
    const cells = await firstCellTexts(this.usersCard);
    return cells.map((text) => text.split('\n').pop()?.trim() ?? '');
  }

  get noResults(): Locator {
    return this.usersCard.getByRole('heading', { name: SETTINGS_COPY.users.noResults.title, exact: true });
  }

  userRow(login: string): AccessUserRow {
    return new AccessUserRow(this.page, login);
  }
}
