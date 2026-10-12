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

import { BasePage } from './common';
import { PATHS } from './paths';

export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.visit(PATHS.login);
  }

  providerButton(providerName: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`Sign in with ${providerName}`, 'i') });
  }

  get usernameInput(): Locator {
    return this.page.getByLabel(/username/i);
  }

  get passwordInput(): Locator {
    return this.page.getByLabel(/password/i);
  }

  get usernameTextbox(): Locator {
    return this.page.getByRole('textbox', { name: /Username/i });
  }

  get signInButton(): Locator {
    return this.page.getByRole('button', { name: /^Sign in$/i });
  }

  get usernameRequiredError(): Locator {
    return this.page.getByText('Enter your username.');
  }

  get passwordRequiredError(): Locator {
    return this.page.getByText('Enter your password.');
  }

  get invalidCredentialsError(): Locator {
    return this.page.getByText('Invalid username or password.');
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
    await this.page.getByRole('button', { name: new RegExp(providerName, 'i') }).click();
    return new URL((await providerRequest).url());
  }
}
