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

import { COMMON_COPY, CONNECTION_MODAL_COPY, WEBHOOK_COPY } from '../app-copy';

import { BasePage, tableRow } from './common';

const WEBHOOK_PLUGIN_NAME = 'Webhook';

// The webhook list inside the "Manage connections: Webhook" dialog, with the dialogs it opens.
export class WebhooksDialog extends BasePage {
  get manage(): Locator {
    return this.dialog(CONNECTION_MODAL_COPY.title(WEBHOOK_PLUGIN_NAME));
  }

  get createDialog(): Locator {
    return this.dialog(WEBHOOK_COPY.create.title);
  }

  get createdNotice(): Locator {
    return this.createDialog.getByText(WEBHOOK_COPY.create.generated);
  }

  get detailDialog(): Locator {
    return this.dialog(new RegExp(`^${WEBHOOK_COPY.view.title}$`));
  }

  get detailKeyNotice(): Locator {
    return this.detailDialog.getByText(WEBHOOK_COPY.view.keyNotice);
  }

  get editDialog(): Locator {
    return this.dialog(WEBHOOK_COPY.edit.title);
  }

  row(name: string): Locator {
    return tableRow(this.manage, name);
  }

  async create(name: string): Promise<void> {
    await this.manage.getByRole('button', { name: WEBHOOK_COPY.add }).click();
    await this.createDialog.getByPlaceholder(WEBHOOK_COPY.create.namePlaceholder).fill(name);
    await this.createDialog.getByRole('button', { name: WEBHOOK_COPY.create.submit }).click();
  }

  async finishCreate(): Promise<void> {
    await this.createDialog.getByRole('button', { name: WEBHOOK_COPY.create.done }).click();
  }

  async rename(name: string, renamed: string): Promise<void> {
    await this.row(name)
      .getByRole('button', { name: WEBHOOK_COPY.actions.edit(name) })
      .click();
    await this.editDialog.getByRole('textbox', { name: WEBHOOK_COPY.create.nameLabel }).fill(renamed);
    await this.editDialog.getByRole('button', { name: WEBHOOK_COPY.edit.submit }).click();
  }

  async openDetail(name: string): Promise<void> {
    await this.row(name)
      .getByRole('button', { name: WEBHOOK_COPY.actions.view(name) })
      .click();
  }

  // Revokes the key from the detail dialog and returns the HTTP status of the renew request.
  async renewKey(name: string): Promise<number> {
    const renewed = this.page.waitForResponse(
      (res) => /\/api-keys\/\d+$/.test(new URL(res.url()).pathname) && res.request().method() === 'PUT',
    );
    await this.detailDialog.getByRole('button', { name: WEBHOOK_COPY.view.renew }).click();
    await this.dialog(WEBHOOK_COPY.view.renewTitle(name))
      .getByRole('button', { name: WEBHOOK_COPY.view.renewConfirm })
      .click();
    return (await renewed).status();
  }

  async closeDetail(): Promise<void> {
    await this.detailDialog.getByRole('button', { name: COMMON_COPY.close, exact: true }).click();
  }

  // Deletes the webhook through its row and returns the HTTP status of the delete request.
  async remove(name: string, webhookId: number): Promise<number> {
    await this.row(name)
      .getByRole('button', { name: WEBHOOK_COPY.actions.remove(name) })
      .click();
    const deleted = this.page.waitForResponse(
      (res) => res.url().endsWith(`/plugins/webhook/connections/${webhookId}`) && res.request().method() === 'DELETE',
    );
    await this.confirmDialog(WEBHOOK_COPY.remove.title(name), WEBHOOK_COPY.remove.confirm);
    return (await deleted).status();
  }
}
