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

// Structural and AntD-specific selectors live here so a visual reskin only touches this file.

export const modalByTitle = (page: Page, title: string | RegExp): Locator => page.getByRole('dialog', { name: title });

export const tableRow = (scope: Page | Locator, text: string | RegExp): Locator =>
  scope.locator('tbody tr.ant-table-row').filter({ hasText: text });

export const toast = (page: Page, text: string | RegExp): Locator =>
  page.locator('.ant-message-notice').filter({ hasText: text });

export const sidebarMenu = (page: Page): Locator => page.getByRole('menu').first();

export const catalogCard = (page: Page, name: string): Locator =>
  page.locator('li').filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

export const catalogCards = (page: Page): Locator => page.locator('li .name');

export const radioRowCheckbox = (row: Locator): Locator => row.locator('.ant-radio-input, .ant-checkbox-input');

export const selectOption = (page: Page, label: string | RegExp): Locator =>
  page.locator('.ant-select-item-option').filter({ hasText: label });

// AntD icons render role="img" with aria-label set to the icon name (for example "delete", "link").
export const iconButton = (scope: Page | Locator, iconName: string): Locator =>
  scope.locator(`button:has([aria-label="${iconName}"])`);

export const tabByName = (page: Page, name: string): Locator => page.getByRole('tab', { name, exact: true });

// The five cron inputs (minute, hour, day, month, week) of the Custom sync frequency.
export const cronFieldInputs = (dialog: Locator): Locator => dialog.locator('input.ant-input');

export const pipelineRowById = (page: Page, id: number): Locator =>
  page.locator('tbody tr.ant-table-row').filter({ has: page.getByRole('cell', { name: String(id), exact: true }) });

export const selectBox = (scope: Page | Locator): Locator => scope.locator('.ant-select').first();

export const textInputs = (scope: Page | Locator): Locator => scope.locator('input.ant-input');

export const tableRows = (scope: Page | Locator): Locator => scope.locator('tbody tr.ant-table-row');

export const rowCells = (row: Locator): Locator => row.locator('td');

export const tableWithRow = (page: Page, text: string | RegExp): Locator =>
  page.locator('.ant-table').filter({ has: tableRow(page, text) });

export const modalWithText = (page: Page, text: string | RegExp): Locator =>
  page.getByRole('dialog').filter({ hasText: text });

export const openModals = (page: Page): Locator => page.getByRole('dialog');

export const modalCloseButton = (modal: Locator): Locator => modal.locator('.ant-modal-close');

export const popconfirm = (page: Page): Locator => page.locator('.ant-popconfirm');

export const tagWithText = (scope: Page | Locator, text: string | RegExp): Locator =>
  scope.locator('.ant-tag').filter({ hasText: text });

export const codeBlock = (scope: Locator): Locator => scope.locator('pre, code, textarea').first();

export const editableControls = (scope: Locator): Locator =>
  scope.locator('select, .ant-select, input[type="radio"], input[type="checkbox"]');

export const sectionWithHeading = (page: Page, heading: Locator): Locator =>
  page.locator('.ant-flex').filter({ has: heading }).last();

export const sectionHeaderButton = (page: Page, heading: string): Locator =>
  page.locator('h3', { hasText: heading }).getByRole('button');

export const appHeader = (page: Page): Locator => page.locator('header');

export const catalogCardCount = (card: Locator): Locator => card.locator('.count');

// Access page and local password screens.
export const addLocalUserModal = (page: Page): Locator => modalWithText(page, 'Add local DevLake user');

export const localUserDisplayNameInput = (modal: Locator): Locator => modal.locator('input').nth(1);

export const oneTimePasswordModal = (page: Page): Locator => modalWithText(page, 'Copy this password now');

export const accessUserRow = (page: Page, login: string): Locator =>
  page
    .locator('table')
    .first()
    .getByRole('row', { name: new RegExp(login) });

export const passwordInputs = (page: Page): Locator => page.locator('input[type="password"]');

// AntD 6 Empty renders both an SVG title and a description with the same text; target the description.
export const emptyState = (page: Page, text: string): Locator =>
  page.locator('.ant-empty-description').filter({ hasText: text });
