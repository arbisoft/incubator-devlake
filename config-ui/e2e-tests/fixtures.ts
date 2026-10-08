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
import { expect } from '@playwright/test';

import { CONNECTION_TEST_URL } from './support/constants';
import { test as base } from './support/write-recorder';

export const test = base.extend<{
  browserErrors: string[];
}>({
  browserErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Static function can not consume context')) return;
        // Ignore expected 401 when checking unauthenticated session on initial load
        if (text.includes('status of 401 (Unauthorized)')) {
          return;
        }
        if (text.includes('Failed to load resource') && CONNECTION_TEST_URL.test(msg.location().url)) {
          return;
        }
        errors.push(`[console.error] ${text}`);
      }
    });
    page.on('pageerror', (err) => {
      errors.push(`[pageerror] ${err.message}`);
    });
    await use(errors);
    expect(errors).toEqual([]);
  },
});

export { expect };
