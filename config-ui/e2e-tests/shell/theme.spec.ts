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
import { Page } from '@playwright/test';

import { test, expect } from '../fixtures';
import { loginAsAdmin } from '../auth-helpers';

const STORAGE_KEY = 'devlake.theme';

const themeButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const readStoredMode = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);

// Perceived brightness (0-255) of the rendered page background.
const backgroundBrightness = async (page: Page): Promise<number> => {
  const colour = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = (colour.match(/[\d.]+/g) ?? []).map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

const expectDark = async (page: Page) => {
  await expect.poll(() => backgroundBrightness(page)).toBeLessThan(80);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
};

const expectLight = async (page: Page) => {
  await expect.poll(() => backgroundBrightness(page)).toBeGreaterThan(180);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
};

test.describe('theme toggle', () => {
  let originalMode: string | null = null;

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test.afterEach(async ({ page }) => {
    // Put the stored mode back so other specs are unaffected.
    await page.evaluate(
      ([key, value]) => {
        if (value === null) {
          window.localStorage.removeItem(key as string);
        } else {
          window.localStorage.setItem(key as string, value);
        }
      },
      [STORAGE_KEY, originalMode],
    );
  });

  test('cycles light, dark, system and the mode and background persist across reload', async ({
    page,
    browserErrors,
  }) => {
    await page.goto('/projects');
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible();
    originalMode = await readStoredMode(page);

    // Start from a known mode, then reload so the app picks it up.
    await page.evaluate((key) => window.localStorage.setItem(key, 'light'), STORAGE_KEY);
    await page.reload();
    await expect(themeButton(page, 'Light theme')).toBeVisible();
    await expectLight(page);

    await themeButton(page, 'Light theme').click();
    await expect(themeButton(page, 'Dark theme')).toBeVisible();
    expect(await readStoredMode(page)).toBe('dark');
    await expectDark(page);

    await page.reload();
    await expect(themeButton(page, 'Dark theme')).toBeVisible();
    expect(await readStoredMode(page)).toBe('dark');
    await expectDark(page);

    await themeButton(page, 'Dark theme').click();
    await expect(themeButton(page, 'Follow system')).toBeVisible();
    expect(await readStoredMode(page)).toBe('system');

    await themeButton(page, 'Follow system').click();
    await expect(themeButton(page, 'Light theme')).toBeVisible();
    expect(await readStoredMode(page)).toBe('light');
    await expectLight(page);

    await page.reload();
    await expect(themeButton(page, 'Light theme')).toBeVisible();
    expect(await readStoredMode(page)).toBe('light');
    await expectLight(page);
    expect(browserErrors).toEqual([]);
  });

  test('system mode follows the OS colour scheme and persists across reload', async ({ page, browserErrors }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/projects');
    originalMode = await readStoredMode(page);
    await page.evaluate((key) => window.localStorage.setItem(key, 'system'), STORAGE_KEY);
    await page.reload();
    await expect(themeButton(page, 'Follow system')).toBeVisible();
    await expectDark(page);

    await page.emulateMedia({ colorScheme: 'light' });
    await expectLight(page);

    await page.reload();
    await expect(themeButton(page, 'Follow system')).toBeVisible();
    expect(await readStoredMode(page)).toBe('system');
    await expectLight(page);

    await page.emulateMedia({ colorScheme: 'dark' });
    await expectDark(page);
    expect(browserErrors).toEqual([]);
  });
});
