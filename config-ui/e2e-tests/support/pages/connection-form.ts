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

import { CONNECTION_FORM_COPY } from '../app-copy';

// The create or edit form of a plugin connection, shown inside its "Manage Connections" dialog.
export class ConnectionForm {
  constructor(
    private readonly page: Page,
    private readonly pluginKey: string,
    readonly dialog: Locator,
  ) {}

  get validFrom(): Locator {
    return this.dialog.getByText(/Valid From:/);
  }

  async fillName(name: string): Promise<void> {
    await this.dialog.getByPlaceholder('Your Connection Name').fill(name);
  }

  async clickNameField(): Promise<void> {
    await this.dialog.getByPlaceholder('Your Connection Name').click();
  }

  async fillToken(token: string): Promise<void> {
    await this.dialog.getByPlaceholder('Token').fill(token);
  }

  async fillOrganization(organization: string): Promise<void> {
    await this.dialog.getByPlaceholder('e.g. org_123456789').fill(organization);
  }

  async addHeader(index: number, key: string, value: string): Promise<void> {
    await this.dialog.getByRole('button', { name: '+ Add Header' }).click();
    await this.dialog.getByPlaceholder('Header name').nth(index).fill(key);
    await this.dialog.getByPlaceholder('Header value').nth(index).fill(value);
  }

  async test(): Promise<void> {
    await this.dialog.getByRole('button', { name: CONNECTION_FORM_COPY.test.label }).click();
  }

  // Clicks Test Connection and returns the HTTP status of the plugin's test request.
  async testAndGetStatus(): Promise<number> {
    const testResponse = this.page.waitForResponse(
      (res) => res.url().endsWith(`/plugins/${this.pluginKey}/test`) && res.request().method() === 'POST',
    );
    await this.test();
    return (await testResponse).status();
  }

  async save(): Promise<void> {
    await this.dialog.getByRole('button', { name: CONNECTION_FORM_COPY.save.label }).click();
  }
}
