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
import { DbMigratePage } from '../support/pages/db-migrate';
import { PATHS } from '../support/pages/paths';

test.describe('pending database migration', () => {
  test('a 428 from the API lands on the migration page, and proceeding returns to the app', async ({ page }) => {
    const migrate = new DbMigratePage(page);
    await migrate.interceptPendingMigration();

    await migrate.visit(PATHS.projects);
    await expect(page).toHaveURL(migrate.urlPattern);
    await expect(migrate.ready).toBeVisible();
    await expect(migrate.warning).toBeVisible();
    await expect(migrate.proceedButton).toBeEnabled();
    expect(migrate.migrationRequests).toBe(0);

    await migrate.allowMigration();
    await migrate.proceed();

    await expect(page).toHaveURL(migrate.homePattern);
    expect(migrate.migrationRequests).toBe(1);
  });
});
