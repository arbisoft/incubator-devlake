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
import { loginAsAdmin } from '../auth-helpers';

test.describe('Access Management & Authentication', () => {
  test('loads access page for authenticated admin', async ({ page, context }) => {
    await loginAsAdmin(context);

    await page.goto('/access');
    await expect(page).toHaveURL(/.*\/access/);

    // Verify navigation and core access sections are visible
    await expect(page.getByRole('menu').getByText('User Management')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Allowed domains' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent access activity' })).toBeVisible();

    // Verify user directory heading (People / User Directory)
    const userSection = page.getByRole('heading', { name: /People|User|Authentication/i }).first();
    await expect(userSection).toBeVisible();
  });
});
