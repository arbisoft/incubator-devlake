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

import { BLUEPRINT_CONNECTION_COPY as COPY, DATA_SCOPE_SELECT_COPY, PAGE_HEADER_COPY } from '../app-copy';

import { BasePage, urlEndingWith } from './common';
import { PATHS } from './paths';

// The Edit Data Scope page of a connection inside a project blueprint or an advanced blueprint.
export class BlueprintConnectionPage extends BasePage {
  async openInProject(projectName: string, unique: string): Promise<void> {
    await this.visit(PATHS.projectConnection(projectName, unique));
  }

  async openInBlueprint(blueprintId: number, unique: string): Promise<void> {
    await this.visit(PATHS.blueprintConnection(blueprintId, unique));
  }

  advancedUrlPattern(blueprintId: number, unique: string): RegExp {
    return urlEndingWith(PATHS.blueprintConnection(blueprintId, unique));
  }

  heading(connectionName: string): Locator {
    return this.page.getByRole('heading', { level: 1, name: COPY.title(connectionName), exact: true });
  }

  breadcrumbLink(label: string): Locator {
    return this.page
      .getByRole('navigation', { name: PAGE_HEADER_COPY.breadcrumb })
      .getByRole('link', { name: label, exact: true });
  }

  async goBackToConfigurations(): Promise<void> {
    await this.breadcrumbLink(COPY.breadcrumbs.configurations).click();
  }

  get manageButton(): Locator {
    return this.page.getByRole('button', { name: COPY.manage.action });
  }

  async openManage(): Promise<void> {
    await this.manageButton.click();
  }

  get manageDialog(): Locator {
    return this.dialog(COPY.manage.title);
  }

  scopeRow(scopeName: string): Locator {
    return this.row(scopeName);
  }

  get removeButton(): Locator {
    return this.page.getByRole('button', { name: COPY.remove.action });
  }

  async removeConnection(connectionName: string): Promise<void> {
    await this.removeButton.click();
    await this.confirmDialog(COPY.remove.title(connectionName), COPY.remove.confirm);
  }

  get followUpDialog(): Locator {
    return this.dialog(COPY.followUp.title);
  }

  async postponeRecollect(): Promise<void> {
    await this.followUpDialog.getByRole('button', { name: COPY.followUp.cancel, exact: true }).click();
  }

  async recollect(): Promise<void> {
    await this.followUpDialog.getByRole('button', { name: COPY.followUp.confirm, exact: true }).click();
  }

  async saveManageScopes(): Promise<void> {
    await this.manageDialog.getByRole('button', { name: DATA_SCOPE_SELECT_COPY.save, exact: true }).click();
  }
}
