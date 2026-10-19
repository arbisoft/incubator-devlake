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
import { Locator, Response } from '@playwright/test';

import {
  INTEGRATION_CATEGORY,
  PROJECT_DETAIL_COPY,
  PROJECT_HOME_COPY as HOME_COPY,
  READINESS_COPY,
  READINESS_SIGNAL,
} from '../app-copy';

import { BasePage } from './common';

export type ReadinessSignalKey = (typeof READINESS_SIGNAL)[keyof typeof READINESS_SIGNAL];

type IntegrationCategory = (typeof INTEGRATION_CATEGORY)[keyof typeof INTEGRATION_CATEGORY];

const SCORECARD_URL = '**/compliance-scorecard';
const SCORECARD_FAILURE_STATUS = 500;

const signalRow = (scope: Locator, key: ReadinessSignalKey): Locator =>
  scope.getByRole('listitem').filter({ hasText: READINESS_COPY.signals[key].name });

// The readiness and data connection cells of the projects table, and the popovers they open.
export class ProjectsReadiness extends BasePage {
  private async cell(row: Locator, column: string): Promise<Locator> {
    const index = await this.page
      .getByRole('columnheader', { name: column, exact: true })
      .evaluate((element) => (element as HTMLTableCellElement).cellIndex);
    return row.getByRole('cell').nth(index);
  }

  readinessCell(row: Locator): Promise<Locator> {
    return this.cell(row, HOME_COPY.columns.readiness);
  }

  async readinessMeter(row: Locator): Promise<Locator> {
    return (await this.readinessCell(row)).getByRole('img');
  }

  async openReadinessPopover(row: Locator): Promise<void> {
    await (await this.readinessCell(row)).getByRole('button').hover();
  }

  get readinessPopover(): Locator {
    return this.page.getByRole('tooltip').filter({ hasText: READINESS_COPY.title });
  }

  readinessSignal(key: ReadinessSignalKey): Locator {
    return signalRow(this.readinessPopover, key);
  }

  get readinessAddConnection(): Locator {
    return this.readinessPopover.getByRole('link', { name: READINESS_COPY.addConnection });
  }

  async addConnection(): Promise<void> {
    await this.readinessAddConnection.click();
  }

  async openConnectionsPopover(row: Locator, connectionNames: string[]): Promise<void> {
    await (
      await this.cell(row, HOME_COPY.columns.connections)
    )
      .getByRole('button', { name: HOME_COPY.connectionsLabel(connectionNames) })
      .hover();
  }

  get connectionsPopover(): Locator {
    return this.page.getByRole('tooltip').filter({ hasText: HOME_COPY.connectionsPopover.title });
  }

  connectionRow(name: string, pluginLabel: string, category: IntegrationCategory): Locator {
    return this.connectionsPopover
      .getByRole('listitem')
      .filter({ hasText: name })
      .filter({ hasText: HOME_COPY.connectionsPopover.subtitle(pluginLabel, category) });
  }

  categoryChip(category: IntegrationCategory, count: number): Locator {
    return this.connectionsPopover.getByRole('listitem').filter({ hasText: new RegExp(`^${category}\\s*${count}$`) });
  }

  get toasts(): Locator {
    return this.page.locator('.ant-message-notice');
  }

  // Makes every scorecard request answer with a server error; call before opening the page.
  async failScorecard(): Promise<void> {
    await this.page.route(SCORECARD_URL, (route) => route.fulfill({ status: SCORECARD_FAILURE_STATUS }));
  }

  waitForScorecardFailure(): Promise<Response> {
    return this.page.waitForResponse(
      (res) => res.url().endsWith('/compliance-scorecard') && res.status() === SCORECARD_FAILURE_STATUS,
    );
  }
}

// The DevLake readiness card on a project's Settings tab.
export class ProjectReadinessCard extends BasePage {
  get card(): Locator {
    return this.page.getByRole('region', { name: READINESS_COPY.title, exact: true });
  }

  private get signals(): Locator {
    return this.card.getByRole('list', { name: PROJECT_DETAIL_COPY.readiness.listLabel });
  }

  percent(text: string): Locator {
    return this.card.getByText(text, { exact: true });
  }

  get meter(): Locator {
    return this.card.getByRole('img', { name: /signals available$/ });
  }

  signal(key: ReadinessSignalKey): Locator {
    return signalRow(this.signals, key);
  }

  signalStatus(key: ReadinessSignalKey, state: string): Locator {
    return this.signal(key).getByRole('img', { name: state, exact: true });
  }
}
