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

import { BLUEPRINT_DETAIL_COPY as COPY, BLUEPRINT_VIEW } from '../app-copy';

import { BasePage, Screen, pipelineRowById, segmentedOption } from './common';
import { PATHS } from './paths';
import {
  openPipelineRowDetail,
  pipelineDetailDialog,
  pipelineDetailOpened,
  pipelineRowMenuButton,
  pipelineTasksLabel,
} from './pipeline-table';

export type BlueprintViewKey = (typeof BLUEPRINT_VIEW)[keyof typeof BLUEPRINT_VIEW];

// The Status / Configurations switch and the Status view, which look the same under a project and under Advanced.
export class BlueprintViews extends BasePage {
  viewOption(view: BlueprintViewKey): Locator {
    return segmentedOption(this.page, COPY.views[view]);
  }

  selectedViewOption(view: BlueprintViewKey): Locator {
    return this.page.locator('.ant-segmented-item-selected').filter({ hasText: COPY.views[view] });
  }

  // The Configurations view is not rebuilt yet, so its heading is still a literal.
  get syncPolicyHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Sync Policy' });
  }

  // What each view shows once it has loaded.
  viewContent(view: BlueprintViewKey): Locator {
    return view === BLUEPRINT_VIEW.STATUS ? this.currentPipelineHeading : this.syncPolicyHeading;
  }

  pipelineRow(id: number): Locator {
    return pipelineRowById(this.page, id);
  }

  pipelineDetailOpened(id: number): Locator {
    return pipelineDetailOpened(this.page, id);
  }

  pipelineDetailTasksLabel(id: number): Locator {
    return pipelineTasksLabel(this.pipelineDetailDialog(id));
  }

  async openView(view: BlueprintViewKey): Promise<void> {
    await this.viewOption(view).click();
  }

  get currentPipelineHeading(): Locator {
    return this.page.getByRole('heading', { name: COPY.panels.current });
  }

  get historicalPipelinesHeading(): Locator {
    return this.page.getByRole('heading', { name: COPY.panels.historical });
  }

  get noCurrentRun(): Locator {
    return this.page.getByText(COPY.empty.current);
  }

  get pipelineTasksLabel(): Locator {
    return pipelineTasksLabel(this.page);
  }

  async collectData(): Promise<void> {
    await this.page.getByRole('button', { name: COPY.actions.collect, exact: true }).click();
  }

  rowMenuButton(id: number): Locator {
    return pipelineRowMenuButton(this.page, id);
  }

  async openPipelineDetail(id: number): Promise<void> {
    await openPipelineRowDetail(this.page, id);
  }

  pipelineDetailDialog(id: number): Locator {
    return pipelineDetailDialog(this.page, id);
  }
}

export class BlueprintDetailPage extends BlueprintViews implements Screen {
  constructor(
    page: Page,
    private readonly blueprintId: number,
  ) {
    super(page);
  }

  async open(view: BlueprintViewKey = BLUEPRINT_VIEW.STATUS): Promise<void> {
    await this.visit(
      view === BLUEPRINT_VIEW.STATUS
        ? PATHS.blueprint(this.blueprintId)
        : `${PATHS.blueprint(this.blueprintId)}/${view}`,
    );
  }

  get urlPattern(): RegExp {
    return new RegExp(`${PATHS.blueprint(this.blueprintId)}$`);
  }

  viewUrlPattern(view: BlueprintViewKey): RegExp {
    return view === BLUEPRINT_VIEW.STATUS
      ? this.urlPattern
      : new RegExp(`${PATHS.blueprint(this.blueprintId)}/${view}$`);
  }

  get ready(): Locator {
    return this.viewOption(BLUEPRINT_VIEW.STATUS);
  }
}
