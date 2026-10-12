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

import { PageResponse } from '../api';
import { TEST_ACTION_HEADER } from '../constants';

// Structural and AntD-specific helpers shared by every page object, so a visual reskin only touches page objects.

const modalByTitle = (page: Page, title: string | RegExp): Locator => page.getByRole('dialog', { name: title });

export const modalWithText = (page: Page, text: string | RegExp): Locator =>
  page.getByRole('dialog').filter({ hasText: text });

export const tableRow = (scope: Page | Locator, text: string | RegExp): Locator =>
  scope.locator('tbody tr.ant-table-row').filter({ hasText: text });

export const tableRows = (scope: Page | Locator): Locator => scope.locator('tbody tr.ant-table-row');

export const tableWithRow = (page: Page, text: string | RegExp): Locator =>
  page.locator('.ant-table').filter({ has: tableRow(page, text) });

const toast = (page: Page, text: string | RegExp): Locator =>
  page.locator('.ant-message-notice').filter({ hasText: text });

export const sidebarMenu = (page: Page): Locator => page.getByRole('menu').first();

export const selectOption = (page: Page, label: string | RegExp): Locator =>
  page.locator('.ant-select-item-option').filter({ hasText: label });

// AntD icons render role="img" with aria-label set to the icon name (for example "delete", "link").
export const iconButton = (scope: Page | Locator, iconName: string): Locator =>
  scope.locator(`button:has([aria-label="${iconName}"])`);

const tabByName = (page: Page, name: string): Locator => page.getByRole('tab', { name, exact: true });

// The five cron inputs (minute, hour, day, month, week) of the Custom sync frequency.
export const cronFieldInputs = (dialog: Locator): Locator => dialog.locator('input.ant-input');

export const pipelineRowById = (page: Page, id: number): Locator =>
  page.locator('tbody tr.ant-table-row').filter({ has: page.getByRole('cell', { name: String(id), exact: true }) });

export const selectBox = (scope: Page | Locator): Locator => scope.locator('.ant-select').first();

export const textInputs = (scope: Page | Locator): Locator => scope.locator('input.ant-input');

export const tagWithText = (scope: Page | Locator, text: string | RegExp): Locator =>
  scope.locator('.ant-tag').filter({ hasText: text });

export const sectionHeaderButton = (page: Page, heading: string): Locator =>
  page.locator('h3', { hasText: heading }).getByRole('button');

// AntD 6 Empty renders both an SVG title and a description with the same text; target the description.
const emptyState = (page: Page, text: string): Locator =>
  page.locator('.ant-empty-description').filter({ hasText: text });

// antd 6 JS-ellipsis keeps the full value only in aria-label, so read it from there when present.
export const cellFullText = async (cell: Locator): Promise<string> => {
  const labelled = cell.locator('[aria-label]:not(button):not([role="img"])').first();
  if (await labelled.count()) {
    return (await labelled.getAttribute('aria-label')) ?? '';
  }
  return (await cell.innerText()).trim();
};

// Matches a URL that ends with the given app path.
export const urlEndingWith = (path: string): RegExp => new RegExp(`${path}$`);

// A screen a spec can open and wait on.
export interface Screen {
  readonly ready: Locator;
  readonly urlPattern: RegExp;
  open(): Promise<void>;
}

export class BasePage {
  constructor(protected readonly page: Page) {}

  async visit(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  // Runs a fetch inside the page with its session cookies; non-GET calls add the CSRF header, and the marker header keeps the write recorder from counting it.
  async sessionFetch<T = unknown>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<PageResponse<T>> {
    return this.page.evaluate(
      async ({ path, method, body, marker }) => {
        const headers: Record<string, string> = { [marker]: '1' };
        if (method !== 'GET') {
          headers['X-CSRF-Token'] = document.cookie.match(/devlake_csrf=([^;]+)/)?.[1] ?? '';
        }
        if (body !== undefined) {
          headers['Content-Type'] = 'application/json';
        }
        const resp = await fetch(path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: resp.status, body: (await resp.json().catch(() => null)) as T | null };
      },
      { path, method: init.method ?? 'GET', body: init.body, marker: TEST_ACTION_HEADER },
    );
  }

  async waitUntilUrl(pattern: RegExp): Promise<void> {
    await this.page.waitForURL(pattern);
  }

  // Waits until the URL path no longer contains the segment.
  async waitUntilPathLeaves(segment: string, timeout?: number): Promise<void> {
    await this.page.waitForURL((url) => !url.pathname.includes(segment), { timeout });
  }

  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  dialog(title: string | RegExp): Locator {
    return modalByTitle(this.page, title);
  }

  toast(text: string | RegExp): Locator {
    return toast(this.page, text);
  }

  row(text: string | RegExp): Locator {
    return tableRow(this.page, text);
  }

  get firstRow(): Locator {
    return tableRows(this.page).first();
  }

  tab(name: string): Locator {
    return tabByName(this.page, name);
  }

  async openTab(name: string): Promise<void> {
    await this.tab(name).click();
  }

  emptyState(text: string): Locator {
    return emptyState(this.page, text);
  }

  // Clicks the Confirm button of a confirmation dialog.
  protected async confirmDialog(title: string | RegExp): Promise<void> {
    await this.dialog(title).getByRole('button', { name: 'Confirm' }).click();
  }
}
