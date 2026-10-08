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

import { describe, expect, it } from 'vitest';

import { PROJECT_TAB } from '@/config';

import { COPY } from './constants';
import { getProjectTabs, toProjectTab } from './utils';

describe('getProjectTabs', () => {
  it('lists the four tabs in order with their URLs', () => {
    expect(getProjectTabs('a b')).toEqual([
      { key: PROJECT_TAB.BLUEPRINT, label: COPY.tabs.blueprint, path: '/projects/a%20b/blueprint' },
      { key: PROJECT_TAB.WEBHOOKS, label: COPY.tabs.webhooks, path: '/projects/a%20b/webhooks' },
      {
        key: PROJECT_TAB.CLAUDE_CODE_OTEL,
        label: COPY.tabs['claude-code-otel'],
        path: '/projects/a%20b/claude-code-otel',
      },
      { key: PROJECT_TAB.SETTINGS, label: COPY.tabs.settings, path: '/projects/a%20b/settings' },
    ]);
  });

  it('hides no tab', () => {
    expect(getProjectTabs('a').every(({ visible }) => visible !== false)).toBe(true);
  });
});

describe('toProjectTab', () => {
  it('keeps a known tab and falls back to the blueprint tab', () => {
    expect(toProjectTab(PROJECT_TAB.SETTINGS)).toBe(PROJECT_TAB.SETTINGS);
    expect(toProjectTab('elsewhere')).toBe(PROJECT_TAB.BLUEPRINT);
    expect(toProjectTab(undefined)).toBe(PROJECT_TAB.BLUEPRINT);
  });
});
