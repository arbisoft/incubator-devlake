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

// Header that marks an in-page fetch as a deliberate test action, so the write recorder skips it.
export const TEST_ACTION_HEADER = 'x-e2e-test-action';

// Placeholder written in place of a masked body value; the key stays so a dropped field still shows in a golden.
export const GOLDEN_MASK = '<masked>';

// Body and query keys (case-insensitive) whose values change per run or are secrets.
export const GOLDEN_MASKED_KEYS: readonly string[] = [
  'id',
  'connectionId',
  'scopeId',
  'scopeConfigId',
  'githubId',
  'ownerId',
  'repoId',
  'rowId',
  'createdAt',
  'updatedAt',
  'createdDate',
  'updatedDate',
  'expiredAt',
  'timeAfter',
  'token',
  'password',
  'currentPassword',
];

// Arrays of objects carrying this key are sorted by it: the backend returns a blueprint plan stage's tasks in map order.
export const GOLDEN_UNORDERED_BY_KEY = 'plugin';

export interface IgnoredWrite {
  method: string;
  // Matched against the normalised path without its query string.
  path: RegExp;
}

// Writes the UI makes that goldens must not pin; every entry cites the R&D decision that moves or reshapes it.
export const GOLDEN_IGNORED_WRITES: readonly IgnoredWrite[] = [
  // D3: connection tests fire lazily from the browser, so their count and timing change with the reskin.
  { method: 'POST', path: /^\/api\/plugins\/[^/]+\/connections\/:id\/test$/ },
  // D3: the pre-save connection test (no id yet) is fired the same way.
  { method: 'POST', path: /^\/api\/plugins\/[^/]+\/test$/ },
  // R&D 6.2: the login screen is rebuilt, and its credentials are covered by the backend assertions.
  { method: 'POST', path: /^\/api\/auth\/local\/login$/ },
  // R&D 6.1: the shell account block and its logout are rebuilt; the session outcome is asserted in the specs.
  { method: 'POST', path: /^\/api\/auth\/logout$/ },
];
