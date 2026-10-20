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

import { expect, Locator, Page } from '@playwright/test';

import { OTEL_MODAL_COPY } from '../app-copy';

import type { OtelSnippetDialog } from './otel';

type ManagedSettingsEnv = { env: Record<string, string> };
type ManagedSettingsBody = { managedSettings: ManagedSettingsEnv };

const CONNECTIONS_PATH = '/api/plugins/claude_otel/connections';

export const createdManagedEnv = (page: Page): Promise<Record<string, string>> =>
  page
    .waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === CONNECTIONS_PATH,
      {
        timeout: 0,
      },
    )
    .then(async (response) => {
      const body: unknown = await response.json();
      expect(body).toHaveProperty('managedSettings.env');
      return (body as ManagedSettingsBody).managedSettings.env;
    });

// The telemetry options of the one-time managed-settings snippet and the JSON they shape.
export class OtelSettingsOptions {
  constructor(private readonly snippet: OtelSnippetDialog) {}

  option(label: string): Locator {
    return this.snippet.dialog.getByRole('checkbox', { name: label, exact: true });
  }

  get lastSignalHint(): Locator {
    return this.snippet.dialog.getByText(OTEL_MODAL_COPY.snippet.options.lastSignal);
  }

  async settings(): Promise<ManagedSettingsEnv> {
    const parsed: unknown = JSON.parse(await this.snippet.code.innerText());
    expect(parsed).toHaveProperty('env');
    return parsed as ManagedSettingsEnv;
  }
}
