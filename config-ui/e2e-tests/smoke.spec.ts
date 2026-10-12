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
import { test, expect } from './fixtures';
import { APP_URL } from './support/env';
import { PATHS } from './support/pages/paths';
import { ShellPage } from './support/pages/shell';

test('config UI loads without browser errors', async ({ page, browserErrors }) => {
  const shell = new ShellPage(page);
  await shell.visit(PATHS.root);
  expect(new URL(page.url()).origin).toBe(new URL(APP_URL).origin);
  await expect(shell.body).toBeVisible();
  expect(browserErrors).toEqual([]);
});
