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

import { BLUEPRINT_HOME_COPY as COPY } from '../app-copy';

import { BlueprintViews, type BlueprintViewKey } from './blueprint-detail';
import { BasePage, Screen, firstCellTexts, segmentedOption, urlEndingWith } from './common';
import { PATHS } from './paths';

export class BlueprintPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.blueprints);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.blueprints);
  }

  get ready(): Locator {
    return this.page.getByRole('button', { name: COPY.newBlueprint });
  }

  async openWithQuery(query: string): Promise<void> {
    await this.visit(`${PATHS.blueprints}?${query}`);
  }

  async search(keyword: string): Promise<void> {
    const box = this.page.getByRole('textbox', { name: COPY.searchPlaceholder });
    await box.fill(keyword);
    await box.press('Enter');
  }

  async filterByStatus(label: string): Promise<void> {
    await segmentedOption(this.page, label).click();
  }

  noResults(): Locator {
    return this.page.getByRole('heading', { name: COPY.noResults.title });
  }

  blueprintNames(): Promise<string[]> {
    return firstCellTexts(this.page);
  }

  async createBlueprint(name: string, mode: 'normal' | 'advanced'): Promise<void> {
    await this.ready.click();
    const dialog = this.dialog(COPY.create.title);
    await dialog.getByRole('textbox', { name: COPY.create.name.label }).fill(name);
    if (mode === 'advanced') {
      await dialog.getByRole('radio', { name: COPY.create.mode.advanced }).check();
    }
    await dialog.getByRole('button', { name: COPY.create.submit }).click();
  }

  async openCreateDialog(): Promise<void> {
    await this.ready.click();
  }

  detailUrlPattern(id: number): RegExp {
    return new RegExp(`${PATHS.blueprint(id)}(/configuration)?$`);
  }

  async openView(view: BlueprintViewKey): Promise<void> {
    await new BlueprintViews(this.page).openView(view);
  }

  blueprintRow(name: string): Locator {
    return this.row(name);
  }

  rowProjectLink(blueprintName: string, projectName: string): Locator {
    return this.blueprintRow(blueprintName).getByRole('link', { name: projectName, exact: true });
  }

  async openBlueprint(name: string): Promise<void> {
    await this.blueprintRow(name).getByRole('link', { name }).click();
  }

  dataScopeCount(count: number): Locator {
    return this.page.getByText(`${count} data scope`);
  }

  connectionLabel(connectionName: string): Locator {
    return this.page.getByText(connectionName);
  }
}
