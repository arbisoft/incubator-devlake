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
import { test, expect } from '../fixtures';
import { uniqueName } from '../support/api';
import { LOGIN_COPY, PROVIDER_ID } from '../support/app-copy';
import { API_URL } from '../support/env';
import { LoginPage, StubProvider } from '../support/pages/login';

const stubProvider = (key: string, issuerHost?: string): StubProvider => {
  const name = uniqueName(key);
  return { name, displayName: name, loginUrl: `/auth/login?provider=${name}`, issuerHost };
};

const KNOWN_HOSTS = [
  { key: PROVIDER_ID.GOOGLE, host: 'accounts.google.com' },
  { key: PROVIDER_ID.MICROSOFT, host: 'login.microsoftonline.com' },
  { key: PROVIDER_ID.OKTA, host: 'acme.okta.com' },
  { key: PROVIDER_ID.GITHUB, host: 'github.com' },
  { key: PROVIDER_ID.GITLAB, host: 'gitlab.com' },
  { key: PROVIDER_ID.AUTH0, host: 'acme.eu.auth0.com' },
  { key: PROVIDER_ID.KEYCLOAK, host: 'keycloak.example.com' },
] as const;

test.describe('Login provider buttons', () => {
  test('shows one button per provider, each with its own logo', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const providers = KNOWN_HOSTS.map(({ key, host }) => ({ key, provider: stubProvider(key, host) }));
    await loginPage.stubProviders(providers.map(({ provider }) => provider));
    await loginPage.open();

    await expect(loginPage.providerButtons).toHaveCount(providers.length);
    for (const { key, provider } of providers) {
      await expect(loginPage.providerLogo(provider.displayName, LOGIN_COPY.logoAlt[key])).toBeVisible();
    }
  });

  test('falls back to a key icon for an unknown or missing issuer host', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const unknown = stubProvider('unknown', 'sso.example.com');
    const missing = stubProvider('missing');
    await loginPage.stubProviders([unknown, missing]);
    await loginPage.open();

    for (const provider of [unknown, missing]) {
      await expect(loginPage.providerButton(provider.displayName)).toBeVisible();
      await expect(loginPage.providerFallbackIcon(provider.displayName)).toBeVisible();
      await expect(loginPage.anyProviderLogo(provider.displayName)).toHaveCount(0);
    }
  });

  test('renders one button for each real provider and the API exposes only the issuer host', async ({ page }) => {
    const res = await page.request.get(`${API_URL}/auth/methods`);
    const { providers = [] } = (await res.json()) as { providers?: StubProvider[] };
    for (const { issuerHost } of providers) {
      expect(issuerHost ?? '').not.toMatch(/[/?#]|:\/\//);
    }

    const loginPage = new LoginPage(page);
    await loginPage.open();
    await expect(loginPage.heading).toBeVisible();
    await expect(loginPage.providerButtons).toHaveCount(providers.length);
    for (const { displayName } of providers) {
      await expect(loginPage.providerButton(displayName)).toBeVisible();
    }
  });
});
