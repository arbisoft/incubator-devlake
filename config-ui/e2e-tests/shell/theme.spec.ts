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
import { loginAsAdmin } from '../auth-helpers';
import { test, expect } from '../fixtures';
import { PATHS } from '../support/pages/paths';
import { ProjectsPage } from '../support/pages/projects';
import { ShellPage } from '../support/pages/shell';

const expectDark = async (shell: ShellPage) => {
  await expect.poll(() => shell.backgroundBrightness()).toBeLessThan(80);
  await expect(shell.html).toHaveAttribute('data-theme', 'dark');
};

const expectLight = async (shell: ShellPage) => {
  await expect.poll(() => shell.backgroundBrightness()).toBeGreaterThan(180);
  await expect(shell.html).toHaveAttribute('data-theme', 'light');
};

test.describe('theme toggle', () => {
  let originalMode: string | null = null;

  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test.afterEach(async ({ page }) => {
    // Put the stored mode back so other specs are unaffected.
    await new ShellPage(page).writeStoredTheme(originalMode);
  });

  test('cycles light, dark, system and the mode and background persist across reload', async ({
    page,
    browserErrors,
  }) => {
    const shell = new ShellPage(page);
    const projects = new ProjectsPage(page);
    await projects.open();
    await expect(projects.ready).toBeVisible();
    originalMode = await shell.readStoredTheme();

    // Start from a known mode, then reload so the app picks it up.
    await shell.writeStoredTheme('light');
    await shell.reload();
    await expect(shell.themeButton('Light theme')).toBeVisible();
    await expectLight(shell);

    await shell.switchTheme('Light theme');
    await expect(shell.themeButton('Dark theme')).toBeVisible();
    expect(await shell.readStoredTheme()).toBe('dark');
    await expectDark(shell);

    await shell.reload();
    await expect(shell.themeButton('Dark theme')).toBeVisible();
    expect(await shell.readStoredTheme()).toBe('dark');
    await expectDark(shell);

    await shell.switchTheme('Dark theme');
    await expect(shell.themeButton('Follow system')).toBeVisible();
    expect(await shell.readStoredTheme()).toBe('system');

    await shell.switchTheme('Follow system');
    await expect(shell.themeButton('Light theme')).toBeVisible();
    expect(await shell.readStoredTheme()).toBe('light');
    await expectLight(shell);

    await shell.reload();
    await expect(shell.themeButton('Light theme')).toBeVisible();
    expect(await shell.readStoredTheme()).toBe('light');
    await expectLight(shell);
    expect(browserErrors).toEqual([]);
  });

  test('system mode follows the OS colour scheme and persists across reload', async ({ page, browserErrors }) => {
    const shell = new ShellPage(page);
    await shell.emulateColorScheme('dark');
    await shell.visit(PATHS.projects);
    originalMode = await shell.readStoredTheme();
    await shell.writeStoredTheme('system');
    await shell.reload();
    await expect(shell.themeButton('Follow system')).toBeVisible();
    await expectDark(shell);

    await shell.emulateColorScheme('light');
    await expectLight(shell);

    await shell.reload();
    await expect(shell.themeButton('Follow system')).toBeVisible();
    expect(await shell.readStoredTheme()).toBe('system');
    await expectLight(shell);

    await shell.emulateColorScheme('dark');
    await expectDark(shell);
    expect(browserErrors).toEqual([]);
  });
});
