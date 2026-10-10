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

import { GRAFANA_USERS_COPY } from '../app-copy';
import { passwordMatches } from '../grafana-safety';

import { chooseOption } from './common';

const safeFill = async (field: Locator, value: string): Promise<void> => {
  try {
    await field.fill(value);
  } catch {
    throw new Error('A Grafana user form field could not be filled.');
  }
};

const visibleButtonWithCopy = (scope: Locator, copy: string): Locator =>
  scope.getByRole('button').filter({ has: scope.page().getByText(copy, { exact: true }) });

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
    const matches = passwordMatches(password, expected);
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
