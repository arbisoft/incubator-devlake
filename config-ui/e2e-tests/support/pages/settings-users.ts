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

import { COMMON_COPY, SETTINGS_COPY } from '../app-copy';

import { BasePage, Screen, firstCellTexts, modalWithText, selectBox, chooseOption, urlEndingWith } from './common';
import { PATHS } from './paths';

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
    return this.page.getByRole('heading', { name: SETTINGS_COPY.domains.title });
  }

  get directoryHeading(): Locator {
    return this.page.getByRole('heading', { name: SETTINGS_COPY.users.title, exact: true }).first();
  }

  get addLocalUserButton(): Locator {
    return this.page.getByRole('button', { name: SETTINGS_COPY.users.addLocalUser });
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
    const box = this.page.getByRole('textbox', { name: SETTINGS_COPY.users.searchPlaceholder });
    await box.fill(keyword);
    await box.press('Enter');
  }

  // The email or login shown under each name in the users table.
  async userIdentities(): Promise<string[]> {
    const cells = await firstCellTexts(this.page.getByRole('region', { name: SETTINGS_COPY.users.title, exact: true }));
    return cells.map((text) => text.split('\n').pop()?.trim() ?? '');
  }

  get noResults(): Locator {
    return this.page.getByRole('heading', { name: SETTINGS_COPY.users.noResults.title });
  }

  userRow(login: string): AccessUserRow {
    return new AccessUserRow(this.page, login);
  }
}
