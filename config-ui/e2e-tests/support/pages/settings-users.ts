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

import { BasePage, Screen, modalWithText, selectBox, selectOption, urlEndingWith } from './common';
import { PATHS } from './paths';

// The one-time password dialog shown after a local user is created or reset.
export class OneTimePasswordDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return modalWithText(this.page, 'Copy this password now');
  }

  get passwordInput(): Locator {
    return this.dialog.getByRole('textbox');
  }

  async readPassword(): Promise<string> {
    return (await this.passwordInput.inputValue()).trim();
  }

  async done(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Done' }).click();
  }
}

// The "Add local DevLake user" form.
export class LocalUserDialog {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return modalWithText(this.page, 'Add local DevLake user');
  }

  get usernameInput(): Locator {
    return this.dialog.getByPlaceholder('person');
  }

  get displayNameInput(): Locator {
    return this.dialog.locator('input').nth(1);
  }

  get createButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Create' });
  }

  get formatError(): Locator {
    return this.page.getByText(
      'Use 3-64 letters, numbers, dots, underscores, or hyphens, starting with a letter or number.',
    );
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
    await selectOption(this.page, label).click();
  }

  async create(): Promise<OneTimePasswordDialog> {
    await this.createButton.click();
    return new OneTimePasswordDialog(this.page);
  }

  async cancel(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
  }
}

// A row of the people table on /access, with its local-password actions.
export class AccessUserRow {
  constructor(
    private readonly page: Page,
    private readonly login: string,
  ) {}

  get root(): Locator {
    return this.page
      .locator('table')
      .first()
      .getByRole('row', { name: new RegExp(this.login) });
  }

  get resetButton(): Locator {
    return this.root.getByRole('button', { name: 'Reset' });
  }

  get disableButton(): Locator {
    return this.root.getByRole('button', { name: 'Disable' });
  }

  get enableButton(): Locator {
    return this.root.getByRole('button', { name: 'Enable' });
  }

  // Resets the local password through its confirmation popup and returns the new one-time password dialog.
  async reset(): Promise<OneTimePasswordDialog> {
    await this.resetButton.click();
    await this.page.locator('.ant-popconfirm').getByRole('button', { name: 'Reset' }).click();
    return new OneTimePasswordDialog(this.page);
  }

  async disable(): Promise<void> {
    await this.disableButton.click();
  }

  async enable(): Promise<void> {
    await this.enableButton.click();
  }
}

// The /access page (user management).
export class SettingsUsersPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.access);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.access);
  }

  get ready(): Locator {
    return this.page.getByRole('heading', { name: 'Allowed domains' });
  }

  get directoryHeading(): Locator {
    return this.page.getByRole('heading', { name: /People|User|Authentication/i }).first();
  }

  get addLocalUserButton(): Locator {
    return this.page.getByRole('button', { name: 'Add local user' });
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

  userRow(login: string): AccessUserRow {
    return new AccessUserRow(this.page, login);
  }
}
