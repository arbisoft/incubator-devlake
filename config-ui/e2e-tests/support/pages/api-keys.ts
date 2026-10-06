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
import { Locator } from '@playwright/test';

import { API_KEYS_COPY as COPY } from '../app-copy';

import { BasePage, Screen, firstCellTexts, selectOption, urlEndingWith } from './common';
import { PATHS } from './paths';

export class ApiKeysPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.keys);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.keys);
  }

  get ready(): Locator {
    return this.page.getByRole('button', { name: COPY.newKey });
  }

  keyRow(name: string): Locator {
    return this.row(name);
  }

  get generatedKeyDialog(): Locator {
    return this.dialog(COPY.generated.title);
  }

  async fillNewKeyForm(name: string, expiryLabel: string, allowedPath: string): Promise<void> {
    await this.ready.click();
    const form = this.dialog(COPY.create.title);
    await form.getByRole('textbox', { name: COPY.create.name.label }).fill(name);
    await form.getByRole('combobox', { name: COPY.create.expiration.label }).click();
    await selectOption(this.page, expiryLabel).click();
    const path = form.getByRole('textbox', { name: COPY.create.allowedPath.label });
    await path.fill(allowedPath);
  }

  // Submits the new-key form and returns the one-time API key from the create response.
  async generate(): Promise<string> {
    const created = this.page.waitForResponse(
      (res) => res.url().endsWith('/api-keys') && res.request().method() === 'POST',
    );
    await this.dialog(COPY.create.title).getByRole('button', { name: COPY.create.submit }).click();
    return ((await (await created).json()) as { apiKey: string }).apiKey;
  }

  async closeGeneratedKeyDialog(): Promise<void> {
    await this.generatedKeyDialog.getByRole('button', { name: COPY.generated.close }).click();
  }

  async revokeKey(name: string): Promise<void> {
    await this.keyRow(name).getByRole('button', { name: COPY.revoke }).click();
    await this.confirmDialog(COPY.confirm.title(name), COPY.confirm.confirm);
  }

  async search(keyword: string): Promise<void> {
    const box = this.page.getByRole('textbox', { name: COPY.searchPlaceholder });
    await box.fill(keyword);
    await box.press('Enter');
  }

  async sortByExpiration(): Promise<void> {
    await this.page.getByRole('columnheader', { name: COPY.columns.expiration }).click();
  }

  keyNames(): Promise<string[]> {
    return firstCellTexts(this.page);
  }
}
