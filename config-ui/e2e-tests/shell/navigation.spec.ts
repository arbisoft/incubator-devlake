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
import { APIRequestContext, Page } from '@playwright/test';

import { test, expect } from '../fixtures';
import { loginAsAdmin } from '../auth-helpers';
import { adminApi } from '../support/api';
import { fetchAuthMethods } from '../support/auth-state';
import { Screen } from '../support/pages/common';
import { ConnectionsPage } from '../support/pages/connections';
import { OnboardPage } from '../support/pages/onboard';
import { OtelPage } from '../support/pages/otel';
import { PATHS } from '../support/pages/paths';
import { PipelinesPage } from '../support/pages/pipelines';
import { ProjectsPage } from '../support/pages/projects';
import { BlueprintPage } from '../support/pages/blueprints';
import { ApiKeysPage } from '../support/pages/api-keys';
import { LoginPage } from '../support/pages/login';
import { SettingsUsersPage } from '../support/pages/settings-users';
import { ShellPage } from '../support/pages/shell';

interface TopLevelPage {
  path: string;
  screen: (page: Page) => Screen;
}

const TOP_LEVEL_PAGES: TopLevelPage[] = [
  { path: PATHS.projects, screen: (page) => new ProjectsPage(page) },
  { path: PATHS.connections, screen: (page) => new ConnectionsPage(page) },
  { path: PATHS.blueprints, screen: (page) => new BlueprintPage(page) },
  { path: PATHS.pipelines, screen: (page) => new PipelinesPage(page) },
  { path: PATHS.keys, screen: (page) => new ApiKeysPage(page) },
  { path: PATHS.access, screen: (page) => new SettingsUsersPage(page) },
  { path: PATHS.otel, screen: (page) => new OtelPage(page) },
];

test.describe('authenticated shell', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  for (const { path, screen: createScreen } of TOP_LEVEL_PAGES) {
    test(`${path} renders its main content without browser errors`, async ({ page, browserErrors }) => {
      const screen = createScreen(page);
      await screen.open();
      await expect(screen.ready).toBeVisible();
      await expect(page).toHaveURL(screen.urlPattern);
      expect(browserErrors).toEqual([]);
    });
  }

  test('sidebar navigation moves between the top-level pages', async ({ page, browserErrors }) => {
    const [projects, connections, blueprints, pipelines, keys, access, otel] = TOP_LEVEL_PAGES.map(({ screen }) =>
      screen(page),
    );
    const shell = new ShellPage(page);
    await projects.open();

    await shell.openMenuItem(/Connections/);
    await expect(page).toHaveURL(connections.urlPattern);
    await expect(connections.ready).toBeVisible();

    await shell.openMenuItem(/Advanced/);
    await shell.openMenuItem('Blueprints');
    await expect(page).toHaveURL(blueprints.urlPattern);
    await expect(blueprints.ready).toBeVisible();

    await shell.openMenuItem('Pipelines');
    await expect(page).toHaveURL(pipelines.urlPattern);
    await expect(pipelines.ready).toBeVisible();

    await shell.openMenuItem(/API Keys/);
    await expect(page).toHaveURL(keys.urlPattern);
    await expect(keys.ready).toBeVisible();

    await shell.openMenuItem(/User Management/);
    await expect(page).toHaveURL(access.urlPattern);
    await expect(access.ready).toBeVisible();

    await shell.openMenuItem(/Projects/);
    await expect(page).toHaveURL(projects.urlPattern);
    await expect(projects.ready).toBeVisible();

    // The OTel page is reached from its catalog card, not the sidebar.
    await shell.openMenuItem(/Connections/);
    await new ConnectionsPage(page).openCard('Claude Code OTel');
    await expect(page).toHaveURL(otel.urlPattern);
    await expect(otel.ready).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test('an unknown route shows the 404 page and its button leads back into the app', async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.visit('/e2e-no-such-page');
    await expect(shell.notFoundTitle).toBeVisible();
    await expect(shell.notFoundMessage).toBeVisible();
    await shell.goHome();
    const projects = TOP_LEVEL_PAGES[0].screen(page);
    await expect(page).toHaveURL(projects.urlPattern);
    await expect(projects.ready).toBeVisible();
  });

  test.describe('onboarding', () => {
    let api: APIRequestContext;
    let originalOnboard: unknown;

    test.beforeAll(async ({ playwright }) => {
      api = await adminApi(playwright);
      originalOnboard = await (await api.get('/store/onboard')).json();
    });

    // The onboarding step is persisted in the store, so always put the original value back.
    test.afterAll(async () => {
      const res = await api.put('/store/onboard', { data: originalOnboard });
      expect(res.ok(), 'restoring the onboard store value').toBe(true);
      await api.dispose();
    });

    test('/onboard opens and steps forward, and the store is restored afterwards', async ({ page, browserErrors }) => {
      const onboard = new OnboardPage(page);
      await onboard.open();
      await expect(onboard.welcome).toBeVisible();
      await onboard.startFirstRepository();
      await expect(onboard.firstRepositoryHeading).toBeVisible();
      await expect(onboard.projectNameInput).toBeVisible();
      await expect(onboard.nextStepButton).toBeDisabled();
      expect(((await (await api.get('/store/onboard')).json()) as { step: number }).step).toBe(1);
      expect(browserErrors).toEqual([]);
    });
  });
});

test.describe('unauthenticated deep link', () => {
  test('a protected deep link redirects to /login carrying the return_url into the sign-in flow', async ({
    page,
    request,
  }) => {
    const methods = await fetchAuthMethods(request);
    const provider = (methods as { providers?: { name: string; loginUrl?: string }[] }).providers?.find(
      (p) => p.loginUrl,
    );
    test.skip(!provider, 'No OIDC provider is configured');

    const login = new LoginPage(page);
    await new PipelinesPage(page).open();
    await expect(page).toHaveURL(login.returnUrlPattern(PATHS.pipelines));

    const url = await login.signInWith(provider?.name as string, provider?.loginUrl as string);
    expect(url.searchParams.get('return_url')).toBe('/advanced/pipelines');
  });
});
