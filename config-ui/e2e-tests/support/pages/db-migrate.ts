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
import { Locator, Route } from '@playwright/test';

import { DB_MIGRATE_COPY } from '../app-copy';
import { API_URL, APP_URL } from '../env';

import { BasePage, Screen, urlEndingWith } from './common';
import { PATHS } from './paths';

const APP_ORIGIN = new URL(APP_URL).origin;
const API_ORIGIN = new URL(API_URL).origin;

const OK_STATUS = 200;
const PENDING_MIGRATION_STATUS = 428;
const MIGRATION_PATH = '/api/proceed-db-migration';

const isApiRequest = (url: URL): boolean =>
  (url.origin === APP_ORIGIN && url.pathname.startsWith('/api/')) || url.origin === API_ORIGIN;

const respond = (route: Route, status: number): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: '{}' });

// Every API call is answered here, so nothing reaches the dev backend.
export class DbMigratePage extends BasePage implements Screen {
  readonly urlPattern = urlEndingWith(PATHS.dbMigrate);

  // The app root; the stubbed API gives the shell nothing to render, so the router stays there.
  readonly homePattern = urlEndingWith(PATHS.root);

  private readonly requested: string[] = [];

  get ready(): Locator {
    return this.page.getByRole('heading', { name: DB_MIGRATE_COPY.heading });
  }

  get warning(): Locator {
    return this.page.getByText(DB_MIGRATE_COPY.warning);
  }

  get proceedButton(): Locator {
    return this.page.getByRole('button', { name: DB_MIGRATE_COPY.proceed });
  }

  // How many times the page asked the backend to migrate.
  get migrationRequests(): number {
    return this.requested.filter((path) => path === MIGRATION_PATH).length;
  }

  async open(): Promise<void> {
    await this.visit(PATHS.dbMigrate);
  }

  // The first API call answers 428, the rest 200, so the app redirects once and never loops.
  async interceptPendingMigration(): Promise<void> {
    let answered = false;
    await this.page.route(isApiRequest, (route) => {
      this.requested.push(new URL(route.request().url()).pathname);
      const status = answered ? OK_STATUS : PENDING_MIGRATION_STATUS;
      answered = true;
      return respond(route, status);
    });
  }

  async allowMigration(): Promise<void> {
    await this.page.unrouteAll({ behavior: 'wait' });
    await this.page.route(isApiRequest, (route) => {
      this.requested.push(new URL(route.request().url()).pathname);
      return respond(route, OK_STATUS);
    });
  }

  async proceed(): Promise<void> {
    await this.proceedButton.click();
  }
}
