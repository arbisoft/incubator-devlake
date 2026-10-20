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

import { expect, Locator } from '@playwright/test';

import { OTEL_MODAL_COPY } from '../app-copy';

import type { OtelSnippetDialog } from './otel';

type ManagedSettingsEnv = { env: Record<string, string> };

// The telemetry options of the one-time managed-settings snippet and the JSON they shape.
export class OtelSettingsOptions {
  constructor(private readonly snippet: OtelSnippetDialog) {}

  option(label: string): Locator {
    return this.snippet.dialog.getByRole('checkbox', { name: label });
  }

  get lastSignalHint(): Locator {
    return this.snippet.dialog.getByText(OTEL_MODAL_COPY.snippet.options.lastSignal);
  }

  async settings(): Promise<ManagedSettingsEnv> {
    return JSON.parse(await this.snippet.code.innerText()) as ManagedSettingsEnv;
  }

  async waitUntilOpened(): Promise<void> {
    await expect(this.snippet.dialog.page().locator('.ant-modal[class*="ant-zoom-"]')).toHaveCount(0);
  }

  async wheelPastContentEnd(): Promise<void> {
    const box = await this.snippet.dialog.locator('.ant-modal-body').boundingBox();
    if (!box) throw new Error('Snippet modal body is not visible');
    const page = this.snippet.dialog.page();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let step = 0; step < 6; step += 1) await page.mouse.wheel(0, box.height);
  }

  async scrollState(): Promise<{ contentAtEnd: boolean; modalTop: number }> {
    return this.snippet.dialog.locator('.ant-modal-body').evaluate((body) => ({
      contentAtEnd: body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 1,
      modalTop: Math.round(body.closest('.ant-modal-container')?.getBoundingClientRect().top ?? Number.NaN),
    }));
  }
}
