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

import { ONBOARD_COPY } from '../app-copy';

import { BasePage } from './common';
import { PATHS } from './paths';

export class OnboardPage extends BasePage {
  async open(): Promise<void> {
    await this.visit(PATHS.onboard);
  }

  get welcome(): Locator {
    return this.page.getByText(ONBOARD_COPY.welcome);
  }

  async startFirstRepository(): Promise<void> {
    await this.page.getByRole('button', { name: ONBOARD_COPY.start }).click();
  }

  get firstRepositoryHeading(): Locator {
    return this.page.getByRole('heading', { name: ONBOARD_COPY.heading });
  }

  get projectNameInput(): Locator {
    return this.page.getByPlaceholder(ONBOARD_COPY.project.namePlaceholder);
  }

  get nextStepButton(): Locator {
    return this.page.getByRole('button', { name: ONBOARD_COPY.next });
  }
}
