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
  AWS_COPY,
  CONNECTION_FORM_COPY,
  DETAIL_COPY,
  SCOPE_CONFIG_FORM_COPY,
  SCOPE_CONFIG_SELECT_COPY,
} from '../app-copy';

import { BasePage } from './common';

const { credentials, authType, regions, costExplorer, setup, testResult } = AWS_COPY;

type AuthTypeKey = (typeof authType.options)[number]['value'];

const authLabel = (value: AuthTypeKey) => authType.options.find((option) => option.value === value)?.label ?? '';

// The AWS fields of a connection's create or edit form, inside its manage dialog.
export class AwsConnectionForm {
  constructor(
    private readonly page: Page,
    private readonly dialog: Locator,
  ) {}

  async fillName(name: string): Promise<void> {
    await this.dialog.getByPlaceholder('Your Connection Name').fill(name);
  }

  async chooseAuthType(value: AuthTypeKey): Promise<void> {
    await this.dialog.getByRole('radio', { name: authLabel(value) }).check();
  }

  async fillAccessKey(authKey: AuthTypeKey, accessKeyId: string, secretAccessKey: string): Promise<void> {
    await this.dialog.getByLabel(credentials.accessKeyId[authKey].label).fill(accessKeyId);
    await this.dialog.getByPlaceholder(credentials.secretPlaceholder).fill(secretAccessKey);
  }

  async fillRoleArn(roleArn: string): Promise<void> {
    await this.dialog.getByLabel(credentials.roleArn.label).fill(roleArn);
  }

  async addRegion(region: string): Promise<void> {
    const input = this.dialog.getByRole('combobox', { name: regions.label });
    await input.fill(region);
    await input.press('Enter');
  }

  async save(): Promise<void> {
    await this.dialog.getByRole('button', { name: CONNECTION_FORM_COPY.save.label }).click();
  }

  get saveButton(): Locator {
    return this.dialog.getByRole('button', { name: CONNECTION_FORM_COPY.save.label });
  }

  // Clicks Test Connection and returns the HTTP status of the test request.
  async testAndGetStatus(): Promise<number> {
    const response = this.page.waitForResponse(
      (res) =>
        /\/plugins\/aws\/(test|connections\/\d+\/test)$/.test(new URL(res.url()).pathname) &&
        res.request().method() === 'POST',
    );
    await this.dialog.getByRole('button', { name: CONNECTION_FORM_COPY.test.label }).click();
    return (await response).status();
  }

  get resultTable(): Locator {
    return this.dialog.getByRole('table', { name: testResult.ariaLabel });
  }

  get externalIdHeading(): Locator {
    return this.dialog.getByRole('heading', { name: setup.externalId.label });
  }

  externalIdCode(externalId: string): Locator {
    return this.dialog.getByRole('code').filter({ hasText: new RegExp(`^${externalId}$`) });
  }

  // The trust policy is the only JSON block that carries the External ID.
  trustPolicyCode(externalId: string): Locator {
    return this.dialog.getByRole('code').filter({ hasText: externalId }).filter({ hasText: 'Statement' });
  }

  copyButton(label: string): Locator {
    return this.dialog.getByRole('button', { name: label });
  }

  resultCell(text: string): Locator {
    return this.resultTable.getByText(text);
  }

  get saveFirstNotice(): Locator {
    return this.dialog.getByText(setup.createInfo.ASSUME_ROLE);
  }

  get costExplorerSwitch(): Locator {
    return this.dialog.getByRole('switch', { name: costExplorer.label });
  }
}

// The scope config form that opens from a scope's associate dialog, with the five AWS patterns.
export class AwsScopeConfigForm extends BasePage {
  private get form(): Locator {
    return this.page.getByRole('dialog', { name: SCOPE_CONFIG_SELECT_COPY.addTitle });
  }

  // Opens the create form from the associate dialog, which the scope row's Associate button has opened.
  async openCreate(): Promise<void> {
    await this.page
      .getByRole('dialog', { name: DETAIL_COPY.associateTitle })
      .getByRole('button', { name: SCOPE_CONFIG_SELECT_COPY.add })
      .click();
  }

  async fillName(name: string): Promise<void> {
    await this.form.getByPlaceholder(SCOPE_CONFIG_FORM_COPY.name.placeholder).fill(name);
  }

  async next(): Promise<void> {
    await this.form.getByRole('button', { name: SCOPE_CONFIG_FORM_COPY.next, exact: true }).click();
  }

  pattern(label: string): Locator {
    return this.form.getByLabel(label, { exact: true });
  }

  async save(): Promise<void> {
    await this.form.getByRole('button', { name: SCOPE_CONFIG_FORM_COPY.save, exact: true }).click();
  }
}
