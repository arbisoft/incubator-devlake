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

import { PIPELINE_COPY as COPY } from '../app-copy';

import {
  BasePage,
  Screen,
  firstCellTexts,
  paginationPage,
  pipelineRowById,
  chooseOption,
  urlEndingWith,
} from './common';
import { PATHS } from './paths';
import {
  openPipelineRowDetail,
  pipelineDetailDialog,
  pipelineDetailOpened,
  pipelineRowMenuButton,
  pipelineTasksLabel,
} from './pipeline-table';

export class PipelinesPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.pipelines);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.pipelines);
  }

  get ready(): Locator {
    return this.page.getByRole('columnheader', { name: COPY.columns.blueprint });
  }

  async openWithQuery(query: string): Promise<void> {
    await this.visit(`${PATHS.pipelines}?${query}`);
  }

  async filterByBlueprint(name: string): Promise<void> {
    await this.page.getByRole('combobox', { name: COPY.blueprintFilter.label }).click();
    await chooseOption(this.page, name);
  }

  async sortByColumn(label: string): Promise<void> {
    await this.page.getByRole('columnheader', { name: label }).click();
  }

  async goToListPage(number: number): Promise<void> {
    await paginationPage(this.page, number).click();
  }

  async pipelineIds(): Promise<number[]> {
    return (await firstCellTexts(this.page)).map(Number);
  }

  async openConfiguration(id: number): Promise<void> {
    await this.pipelineRow(id)
      .getByRole('button', { name: COPY.rowActions.label(id) })
      .click();
    await this.page.getByRole('menuitem', { name: COPY.rowActions.configuration }).click();
  }

  rowActionsButton(id: number): Locator {
    return pipelineRowMenuButton(this.page, id);
  }

  async openDetailModal(id: number): Promise<void> {
    await openPipelineRowDetail(this.page, id);
  }

  detailDialog(id: number): Locator {
    return pipelineDetailDialog(this.page, id);
  }

  detailOpened(id: number): Locator {
    return pipelineDetailOpened(this.page, id);
  }

  detailTasksLabel(id: number): Locator {
    return pipelineTasksLabel(this.detailDialog(id));
  }

  configurationDrawer(id: number): Locator {
    return this.dialog(COPY.drawer.title(id));
  }

  pipelineRow(id: number): Locator {
    return pipelineRowById(this.page, id);
  }

  async openDetail(id: number): Promise<void> {
    await this.visit(PATHS.pipeline(id));
  }

  detailIdLink(id: number): Locator {
    return this.page.getByRole('link', { name: String(id), exact: true });
  }

  get tasksCompletedLabel(): Locator {
    return pipelineTasksLabel(this.page);
  }
}
