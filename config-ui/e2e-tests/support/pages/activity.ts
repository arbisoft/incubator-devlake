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

import { ACTIVITY_COPY } from '../app-copy';

import { BasePage, Screen, urlEndingWith } from './common';
import { PATHS } from './paths';

// The /settings/activity page, with the access audit log.
export class ActivityPage extends BasePage implements Screen {
  async open(): Promise<void> {
    await this.visit(PATHS.settingsActivity);
  }

  get urlPattern(): RegExp {
    return urlEndingWith(PATHS.settingsActivity);
  }

  get ready(): Locator {
    return this.recentActivityHeading;
  }

  get recentActivityHeading(): Locator {
    return this.page.getByRole('heading', { name: ACTIVITY_COPY.title, exact: true });
  }

  async search(keyword: string): Promise<void> {
    await this.page.getByRole('textbox', { name: ACTIVITY_COPY.searchPlaceholder }).fill(keyword);
    await this.page.keyboard.press('Enter');
  }

  // The row whose cells include the text, such as a target email.
  eventRow(text: string): Locator {
    return this.page.getByRole('row').filter({ hasText: text });
  }

  async openEvent(rowText: string): Promise<void> {
    await this.eventRow(rowText).getByRole('button').first().click();
  }

  get drawer(): Locator {
    return this.page.getByRole('dialog', { name: ACTIVITY_COPY.drawer.title, exact: true });
  }
}
