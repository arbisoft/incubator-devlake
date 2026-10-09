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
import { ACCOUNT_BLOCK_COPY, COMMON_COPY, LAYOUT_COPY, SIDEBAR_COPY, THEME_LABEL } from '../app-copy';
import { APP_URL } from '../env';

import { BasePage, iconButton } from './common';

const THEME_STORAGE_KEY = 'devlake.theme';

const SIDEBAR_STORAGE_KEY = 'devlake.sidebarCollapsed';

type ThemeModeKey = keyof typeof THEME_LABEL;

const APP_ORIGIN = new URL(APP_URL).origin;

const STUB_BODY = 'stub external page';

const LINKABLE_PROVIDERS_PATH = '/api/access/oidc-providers/linkable';

const passwordInputs = (page: Page): Locator => page.locator('input[type="password"]');

export class ShellPage extends BasePage {
  get sidebar(): Locator {
    return this.page.getByRole('complementary', { name: SIDEBAR_COPY.sidebar });
  }

  get menu(): Locator {
    return this.sidebar.getByRole('menu');
  }

  navItem(name: string | RegExp): Locator {
    return this.menu.getByRole('menuitem', { name });
  }

  async openMenuItem(name: string | RegExp): Promise<void> {
    await this.navItem(name).click();
  }

  // Opens Settings > Users, expanding the Settings group first when it is closed.
  async openUsersMenuItem(): Promise<void> {
    if (!(await this.usersMenuItem.isVisible())) {
      await this.openNavItem(LAYOUT_COPY.nav.settings);
    }
    await this.openNavItem(LAYOUT_COPY.nav.users);
  }

  get navLabels(): typeof LAYOUT_COPY.nav {
    return LAYOUT_COPY.nav;
  }

  get usersMenuItem(): Locator {
    return this.navItemByLabel(LAYOUT_COPY.nav.users);
  }

  get collapseToggle(): Locator {
    return this.sidebar.getByRole('button', { name: SIDEBAR_COPY.collapse });
  }

  get expandToggle(): Locator {
    return this.sidebar.getByRole('button', { name: SIDEBAR_COPY.expand });
  }

  async collapseSidebar(): Promise<void> {
    await this.collapseToggle.click();
  }

  async expandSidebar(): Promise<void> {
    await this.expandToggle.click();
  }

  async readStoredSidebarCollapsed(): Promise<string | null> {
    return this.page.evaluate((key) => window.localStorage.getItem(key), SIDEBAR_STORAGE_KEY);
  }

  async resizeViewport(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  navItemByLabel(label: string): Locator {
    return this.menu.getByRole('menuitem', { name: label, exact: true });
  }

  // External items announce a new-tab hint after their label.
  externalNavItem(label: string): Locator {
    return this.navItemByLabel(`${label} ${COMMON_COPY.opensInNewTab}`);
  }

  async openNavItem(label: string): Promise<void> {
    await this.navItemByLabel(label).click();
  }

  // The click flyout a collapsed group opens.
  get flyout(): Locator {
    return this.page.locator('.ant-menu-submenu-popup:not(.ant-menu-submenu-hidden)');
  }

  flyoutItem(label: string): Locator {
    return this.flyout.getByRole('menuitem', { name: label, exact: true });
  }

  async openFlyout(label: string): Promise<void> {
    await this.openNavItem(label);
  }

  async openFlyoutItem(label: string): Promise<void> {
    await this.flyoutItem(label).click();
  }

  async closeFlyout(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  get selectedNavItem(): Locator {
    return this.menu.locator('.ant-menu-item-selected');
  }

  // The anchor of a nav item that opens elsewhere.
  navLink(label: string): Locator {
    return this.externalNavItem(label).getByRole('link');
  }

  // Clicks an external nav item with every non-app origin stubbed, and returns the tab it opened.
  async openNavItemInNewTab(label: string): Promise<Page> {
    const context = this.page.context();
    const stub = (url: URL) => url.origin !== APP_ORIGIN;
    const fulfil = (route: { fulfill: (o: { status: number; contentType: string; body: string }) => Promise<void> }) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: STUB_BODY });
    await context.route(stub, fulfil);
    const popup = this.page.waitForEvent('popup');
    await this.externalNavItem(label).click();
    const opened = await popup;
    await opened.waitForLoadState();
    await context.unroute(stub, fulfil);
    return opened;
  }

  async documentTitle(): Promise<string> {
    return this.page.title();
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

  get accountMenu(): Locator {
    return this.page.locator('.ant-dropdown').getByRole('menu');
  }

  // The expanded account block shows an ellipsis icon; the rail shows an initials avatar with its own label.
  get accountTrigger(): Locator {
    return iconButton(this.sidebar, 'ellipsis').or(
      this.sidebar.getByRole('button', { name: ACCOUNT_BLOCK_COPY.menu('') }),
    );
  }

  async openThemeMenu(): Promise<void> {
    await this.accountTrigger.click();
    await this.themeItem('light').waitFor();
  }

  async closeAccountMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.accountMenu.waitFor({ state: 'hidden' });
  }

  themeItem(mode: ThemeModeKey): Locator {
    return this.accountMenu.getByRole('menuitem', { name: THEME_LABEL[mode] });
  }

  themeCheck(mode: ThemeModeKey): Locator {
    return this.themeItem(mode).getByRole('img', { name: LAYOUT_COPY.account.selected });
  }

  async switchTheme(mode: ThemeModeKey): Promise<void> {
    await this.openThemeMenu();
    await this.themeItem(mode).click();
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

  async backgroundColour(): Promise<string> {
    return this.body.evaluate((el) => getComputedStyle(el).backgroundColor);
  }

  get dashboardsLink(): Locator {
    return this.navLink(LAYOUT_COPY.nav.dashboards);
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

  // The account block name is the button text when expanded and its label on the rail.
  accountButton(name: RegExp): Locator {
    return this.sidebar.getByRole('button', { name });
  }

  // Opens the account menu and returns the linkable-providers response the app fetches when it opens.
  async openAccountMenu(name: RegExp): Promise<PageResponse<LinkableProvider[]>> {
    const linkable = this.page.waitForResponse((res) => res.url().includes(LINKABLE_PROVIDERS_PATH));
    await this.accountButton(name).click();
    const res = await linkable;
    return { status: res.status(), body: (await res.json().catch(() => null)) as LinkableProvider[] | null };
  }

  get addGoogleSignInItem(): Locator {
    return this.accountMenu.getByText(LAYOUT_COPY.account.addProviderSignIn('Google'));
  }

  get signOutItem(): Locator {
    return this.accountMenu.getByText(LAYOUT_COPY.account.signOut);
  }

  get noAdditionalProvidersItem(): Locator {
    return this.accountMenu.getByText(LAYOUT_COPY.account.noProviders);
  }
}
