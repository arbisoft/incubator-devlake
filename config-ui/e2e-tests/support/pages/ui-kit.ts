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

import { UI_KIT_COPY } from '../app-copy';
import { UI_KIT_URL } from '../env';

import { BasePage } from './common';
import { PATHS } from './paths';

const THEME_STORAGE_KEY = 'devlake.theme';

export type UiKitMode = 'light' | 'dark';

// The dev-only /ui-kit route, served by a `yarn start` server at E2E_UI_KIT_URL.
export class UiKitPage extends BasePage {
  async open(mode: UiKitMode = 'light'): Promise<void> {
    await this.page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [THEME_STORAGE_KEY, mode]);
    await this.visit(`${UI_KIT_URL}${PATHS.uiKit}`);
  }

  get html(): Locator {
    return this.page.locator('html');
  }

  get title(): Locator {
    return this.page.getByRole('heading', { level: 1, name: UI_KIT_COPY.title, exact: true });
  }

  get sectionTitles(): string[] {
    return Object.values(UI_KIT_COPY.sections);
  }

  sectionHeading(title: string): Locator {
    return this.page.getByRole('heading', { level: 2, name: title, exact: true });
  }
}
