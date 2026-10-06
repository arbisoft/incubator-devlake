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

import { BasePage, Screen, urlEndingWith, selectBox, selectOption, textInputs } from './common';
import { PATHS } from './paths';

export class ApiKeysPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.keys);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.keys);
  }

  get ready(): Locator {
    return this.page.getByRole('button', { name: 'New API Key' });
  }

  keyRow(name: string): Locator {
    return this.row(name);
  }

  get generatedKeyDialog(): Locator {
    return this.dialog('Your API key has been generated!');
  }

  async fillNewKeyForm(name: string, expiryLabel: string, allowedPath: string): Promise<void> {
    await this.ready.click();
    const form = this.dialog('Generate a New API Key');
    await form.getByPlaceholder('My API Key').fill(name);
    await selectBox(form).click();
    await selectOption(this.page, expiryLabel).click();
    await textInputs(form).nth(1).fill(allowedPath);
  }

  // Submits the new-key form and returns the one-time API key from the create response.
  async generate(): Promise<string> {
    const created = this.page.waitForResponse(
      (res) => res.url().endsWith('/api-keys') && res.request().method() === 'POST',
    );
    await this.dialog('Generate a New API Key').getByRole('button', { name: 'Generate' }).click();
    return ((await (await created).json()) as { apiKey: string }).apiKey;
  }

  async closeGeneratedKeyDialog(): Promise<void> {
    await this.generatedKeyDialog.getByRole('button', { name: 'Close' }).click();
  }

  async revokeKey(name: string): Promise<void> {
    await this.keyRow(name).getByRole('button', { name: 'Revoke' }).click();
    await this.confirmDialog('Are you sure you want to revoke this API key?');
  }
}
