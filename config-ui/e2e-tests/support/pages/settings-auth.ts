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

import { ApiMessage, PageResponse } from '../api';
import { BasePage, Screen, tableWithRow, urlEndingWith } from './common';
import { PATHS } from './paths';

// The sign-in providers section of the /access page.
export class SettingsAuthPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.access);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.access);
  }

  get ready(): Locator {
    return this.page.getByRole('heading', { name: 'Authentication', exact: true });
  }

  // The first element with the text inside the providers table that lists the given provider key.
  providerLabel(providerKey: string, text: string): Locator {
    return tableWithRow(this.page, providerKey).getByText(text).first();
  }

  async disableProvider(providerKey: string): Promise<PageResponse<ApiMessage>> {
    return this.sessionFetch<ApiMessage>(`/api/access/oidc-providers/${providerKey}/disable`, { method: 'POST' });
  }

  async enableProvider(providerKey: string): Promise<PageResponse<ApiMessage>> {
    return this.sessionFetch<ApiMessage>(`/api/access/oidc-providers/${providerKey}/enable`, { method: 'POST' });
  }
}
