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

import { PIPELINE_COPY as COPY } from '../app-copy';

import { pipelineRowById } from './common';

// The row menu, the Detail modal and the pipeline panel are shared by every screen that lists pipelines.
export const pipelineRowMenuButton = (page: Page, id: number): Locator =>
  pipelineRowById(page, id).getByRole('button', { name: COPY.rowActions.label(id) });

export async function openPipelineRowDetail(page: Page, id: number): Promise<void> {
  await pipelineRowMenuButton(page, id).click();
  await page.getByRole('menuitem', { name: COPY.rowActions.detail }).click();
}

export const pipelineDetailDialog = (page: Page, id: number): Locator =>
  page.getByRole('dialog', { name: COPY.detail.title(id) });

// The modal ignores Escape until its opening animation has finished.
export const pipelineDetailOpened = (page: Page, id: number): Locator =>
  pipelineDetailDialog(page, id).and(page.locator(':not(.ant-zoom-appear)'));

export const pipelineTasksLabel = (scope: Page | Locator): Locator =>
  scope.getByText(COPY.summary.tasks, { exact: true });
