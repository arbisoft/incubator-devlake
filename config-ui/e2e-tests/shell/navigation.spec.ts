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
import { catalogCard, sidebarMenu } from '../support/selectors';

interface TopLevelPage {
  path: string;
  ready: (page: Page) => ReturnType<Page['locator']>;
}

const TOP_LEVEL_PAGES: TopLevelPage[] = [
  { path: '/projects', ready: (page) => page.getByRole('button', { name: 'New Project' }) },
  { path: '/connections', ready: (page) => page.getByRole('heading', { name: 'Connections', level: 1 }) },
  { path: '/advanced/blueprints', ready: (page) => page.getByRole('button', { name: 'New Blueprint' }) },
  { path: '/advanced/pipelines', ready: (page) => page.getByRole('columnheader', { name: 'Blueprint Name' }) },
  { path: '/keys', ready: (page) => page.getByRole('button', { name: 'New API Key' }) },
  { path: '/access', ready: (page) => page.getByRole('heading', { name: 'Allowed domains' }) },
  { path: '/otel', ready: (page) => page.getByRole('button', { name: /Generate Claude Settings/ }) },
];

test.describe('authenticated shell', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  for (const { path, ready } of TOP_LEVEL_PAGES) {
    test(`${path} renders its main content without browser errors`, async ({ page, browserErrors }) => {
      await page.goto(path);
      await expect(ready(page)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      expect(browserErrors).toEqual([]);
    });
  }

  test('sidebar navigation moves between the top-level pages', async ({ page, browserErrors }) => {
    await page.goto('/projects');
    const menu = sidebarMenu(page);

    await menu.getByRole('menuitem', { name: /Connections/ }).click();
    await expect(page).toHaveURL(/\/connections$/);
    await expect(TOP_LEVEL_PAGES[1].ready(page)).toBeVisible();

    await menu.getByRole('menuitem', { name: /Advanced/ }).click();
    await menu.getByRole('menuitem', { name: 'Blueprints' }).click();
    await expect(page).toHaveURL(/\/advanced\/blueprints$/);
    await expect(TOP_LEVEL_PAGES[2].ready(page)).toBeVisible();

    await menu.getByRole('menuitem', { name: 'Pipelines' }).click();
    await expect(page).toHaveURL(/\/advanced\/pipelines$/);
    await expect(TOP_LEVEL_PAGES[3].ready(page)).toBeVisible();

    await menu.getByRole('menuitem', { name: /API Keys/ }).click();
    await expect(page).toHaveURL(/\/keys$/);
    await expect(TOP_LEVEL_PAGES[4].ready(page)).toBeVisible();

    await menu.getByRole('menuitem', { name: /User Management/ }).click();
    await expect(page).toHaveURL(/\/access$/);
    await expect(TOP_LEVEL_PAGES[5].ready(page)).toBeVisible();

    await menu.getByRole('menuitem', { name: /Projects/ }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(TOP_LEVEL_PAGES[0].ready(page)).toBeVisible();

    // The OTel page is reached from its catalog card, not the sidebar.
    await menu.getByRole('menuitem', { name: /Connections/ }).click();
    await catalogCard(page, 'Claude Code OTel').click();
    await expect(page).toHaveURL(/\/otel$/);
    await expect(TOP_LEVEL_PAGES[6].ready(page)).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test('an unknown route shows the 404 page and its button leads back into the app', async ({ page }) => {
    await page.goto('/e2e-no-such-page');
    await expect(page.getByText('404 Not Found')).toBeVisible();
    await expect(page.getByText('This is an invalid address.')).toBeVisible();
    await page.getByRole('button', { name: 'Go HomePage' }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(TOP_LEVEL_PAGES[0].ready(page)).toBeVisible();
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
      await page.goto('/onboard');
      await expect(page.getByText('Welcome to')).toBeVisible();
      await page.getByRole('button', { name: 'Connect to your first repository' }).click();
      await expect(page.getByRole('heading', { name: 'Connect to your first repository' })).toBeVisible();
      await expect(page.getByPlaceholder('Your Project Name')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Next Step' })).toBeDisabled();
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

    await page.goto('/advanced/pipelines');
    await expect(page).toHaveURL(/\/login\?return_url=%2Fadvanced%2Fpipelines$/);

    const providerRequest = page.waitForRequest((req) => req.url().includes(provider?.loginUrl as string));
    await page.route(`**${provider?.loginUrl}**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'stub identity provider' }),
    );
    await page.getByRole('button', { name: new RegExp(provider?.name as string, 'i') }).click();
    const url = new URL((await providerRequest).url());
    expect(url.searchParams.get('return_url')).toBe('/advanced/pipelines');
  });
});
