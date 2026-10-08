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
import { Locator } from '@playwright/test';

import { LOGIN_COPY } from '../app-copy';

import { BasePage } from './common';
import { PATHS } from './paths';

export interface StubProvider {
  name: string;
  displayName: string;
  loginUrl: string;
  issuerHost?: string;
}

export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.visit(PATHS.login);
  }

  providerButton(providerName: string): Locator {
    return this.page.getByRole('button', { name: LOGIN_COPY.continueWith(providerName) });
  }

  // Serves /auth/methods with the given providers only, so a spec does not depend on the stack's own providers.
  async stubProviders(providers: StubProvider[]): Promise<void> {
    await this.page.route('**/auth/methods', (route) =>
      route.fulfill({ json: { providers, apiKey: { enabled: true } } }),
    );
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: LOGIN_COPY.title });
  }

  get providerButtons(): Locator {
    return this.page.getByRole('button', { name: LOGIN_COPY.continueWith('') });
  }

  providerLogo(providerName: string, alt: string): Locator {
    return this.providerButton(providerName).getByRole('img', { name: alt, exact: true });
  }

  anyProviderLogo(providerName: string): Locator {
    return this.providerButton(providerName).getByRole('img', { name: /logo$/i });
  }

  providerFallbackIcon(providerName: string): Locator {
    return this.providerButton(providerName).locator('.anticon-key');
  }

  get usernameInput(): Locator {
    return this.page.getByLabel(LOGIN_COPY.usernameLabel);
  }

  get passwordInput(): Locator {
    return this.page.getByLabel(LOGIN_COPY.passwordLabel, { exact: true });
  }

  get usernameTextbox(): Locator {
    return this.page.getByRole('textbox', { name: LOGIN_COPY.usernameLabel });
  }

  get signInButton(): Locator {
    return this.page.getByRole('button', { name: LOGIN_COPY.submit, exact: true });
  }

  get usernameRequiredError(): Locator {
    return this.page.getByText(LOGIN_COPY.usernameRequired);
  }

  get passwordRequiredError(): Locator {
    return this.page.getByText(LOGIN_COPY.passwordRequired);
  }

  get invalidCredentialsError(): Locator {
    return this.page.getByText(LOGIN_COPY.invalidCredentials);
  }

  async submit(): Promise<void> {
    await this.signInButton.click();
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submit();
  }

  // Matches /login carrying the given app path as its return_url.
  returnUrlPattern(returnPath: string): RegExp {
    return new RegExp(`/login\\?return_url=${encodeURIComponent(returnPath)}$`);
  }

  // Clicks the provider's sign-in button with its identity-provider page stubbed, and returns the request it sent.
  async signInWith(providerName: string, loginUrl: string): Promise<URL> {
    const providerRequest = this.page.waitForRequest((req) => req.url().includes(loginUrl));
    await this.page.route(`**${loginUrl}**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'stub identity provider' }),
    );
    await this.providerButton(providerName).click();
    return new URL((await providerRequest).url());
  }
}
