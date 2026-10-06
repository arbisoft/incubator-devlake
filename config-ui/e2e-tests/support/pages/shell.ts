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

import { LinkableProvider, PageResponse } from '../api';
import { BasePage, sidebarMenu } from './common';

const THEME_STORAGE_KEY = 'devlake.theme';

const LINKABLE_PROVIDERS_PATH = '/api/access/oidc-providers/linkable';

const passwordInputs = (page: Page): Locator => page.locator('input[type="password"]');

const appHeader = (page: Page): Locator => page.locator('header');

export class ShellPage extends BasePage {
  get menu(): Locator {
    return sidebarMenu(this.page);
  }

  async openMenuItem(name: string | RegExp): Promise<void> {
    await this.menu.getByRole('menuitem', { name }).click();
  }

  get body(): Locator {
    return this.page.locator('body');
  }

  get html(): Locator {
    return this.page.locator('html');
  }

  get notFoundTitle(): Locator {
    return this.page.getByText('404 Not Found');
  }

  get notFoundMessage(): Locator {
    return this.page.getByText('This is an invalid address.');
  }

  async goHome(): Promise<void> {
    await this.page.getByRole('button', { name: 'Go HomePage' }).click();
  }

  themeButton(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  async switchTheme(name: string): Promise<void> {
    await this.themeButton(name).click();
  }

  async readStoredTheme(): Promise<string | null> {
    return this.page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY);
  }

  async writeStoredTheme(mode: string | null): Promise<void> {
    await this.page.evaluate(
      ([key, value]) => {
        if (value === null) {
          window.localStorage.removeItem(key as string);
        } else {
          window.localStorage.setItem(key as string, value);
        }
      },
      [THEME_STORAGE_KEY, mode],
    );
  }

  async emulateColorScheme(colorScheme: 'light' | 'dark'): Promise<void> {
    await this.page.emulateMedia({ colorScheme });
  }

  // Perceived brightness (0-255) of the rendered page background.
  async backgroundBrightness(): Promise<number> {
    const colour = await this.body.evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = (colour.match(/[\d.]+/g) ?? []).map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  menuText(text: string): Locator {
    return this.page.getByRole('menu').getByText(text);
  }

  get dashboardsLink(): Locator {
    return this.page.getByRole('link', { name: /Dashboards/i }).first();
  }

  // Starts a navigation from inside the page, so the app's own redirect cannot abort it the way a goto would.
  async assignLocation(url: string): Promise<void> {
    await this.page.evaluate((target) => setTimeout(() => window.location.assign(target), 0), url);
  }

  get changePasswordTitle(): Locator {
    return this.page.getByText('Change your password');
  }

  get changePasswordPrompt(): Locator {
    return this.page.getByText('Choose a new password to continue.');
  }

  get passwordTooShortError(): Locator {
    return this.page.getByText('Use at least 15 characters.');
  }

  get passwordMismatchError(): Locator {
    return this.page.getByText('Passwords do not match.');
  }

  async changePassword(password: string, confirmation: string = password): Promise<void> {
    await passwordInputs(this.page).first().fill(password);
    await passwordInputs(this.page).nth(1).fill(confirmation);
    await this.page.getByRole('button', { name: 'Change password' }).click();
  }

  accountButton(name: RegExp): Locator {
    return appHeader(this.page).getByRole('button', { name });
  }

  // Opens the account menu and returns the linkable-providers response the app fetches when it opens.
  async openAccountMenu(name: RegExp): Promise<PageResponse<LinkableProvider[]>> {
    const linkable = this.page.waitForResponse((res) => res.url().includes(LINKABLE_PROVIDERS_PATH));
    await this.accountButton(name).click();
    const res = await linkable;
    return { status: res.status(), body: (await res.json().catch(() => null)) as LinkableProvider[] | null };
  }

  get addGoogleSignInItem(): Locator {
    return this.page.getByText(/Add Google sign-in/i);
  }

  get signOutItem(): Locator {
    return this.page.getByText(/Sign out/i);
  }

  get noAdditionalProvidersItem(): Locator {
    return this.page.getByText('No additional sign-in providers');
  }
}
