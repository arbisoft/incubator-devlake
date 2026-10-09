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

import { INTEGRATION_CATEGORY } from '@/plugins/catalog';
import { STATUS_TONE } from '@/ui/constants';

import {
  buildCategoryTabs,
  buildOtelBadges,
  filterByCategory,
  filterIntegrations,
  isCatalogSortKey,
  resolveCategory,
  sortIntegrations,
} from './catalog-utils';
import { CATALOG_SORT, CATEGORY_ALL, COPY } from './constants';
import type { IntegrationSummary } from './types';

const item = (key: string, extra: Partial<IntegrationSummary> = {}): IntegrationSummary => ({
  key,
  name: key,
  icon: () => null,
  category: INTEGRATION_CATEGORY.CODE_SCM,
  weight: 100,
  beta: false,
  deprecated: false,
  connections: 0,
  failed: 0,
  ...extra,
});

const github = item('github', { name: 'GitHub', connections: 2, weight: 10 });
const gitlab = item('gitlab', { name: 'GitLab', weight: 20 });
const jira = item('jira', {
  name: 'Jira',
  category: INTEGRATION_CATEGORY.ISSUES,
  connections: 1,
  weight: 210,
});
const asana = item('asana', { name: 'asana', category: INTEGRATION_CATEGORY.ISSUES, weight: 230 });
const claude = item('claude_code', { name: 'Claude Code', category: INTEGRATION_CATEGORY.AI_ANALYTICS, weight: 410 });
const ALL = [gitlab, asana, jira, claude, github];
const keys = (items: IntegrationSummary[]) => items.map(({ key }) => key);

describe('sortIntegrations', () => {
  it('puts connected integrations first, then orders by weight', () => {
    expect(keys(sortIntegrations(ALL, CATALOG_SORT.ACTIVE))).toEqual([
      'github',
      'jira',
      'gitlab',
      'asana',
      'claude_code',
    ]);
  });

  it('breaks weight ties by name', () => {
    const tied = [item('b', { name: 'Bravo' }), item('a', { name: 'Alpha' })];
    expect(keys(sortIntegrations(tied, CATALOG_SORT.ACTIVE))).toEqual(['a', 'b']);
  });

  it('orders A to Z ignoring case', () => {
    expect(keys(sortIntegrations(ALL, CATALOG_SORT.NAME))).toEqual([
      'asana',
      'claude_code',
      'github',
      'gitlab',
      'jira',
    ]);
  });

  it('does not change the list it is given', () => {
    const input = [...ALL];
    sortIntegrations(input, CATALOG_SORT.NAME);
    expect(input).toEqual(ALL);
  });

  it('recognises only known sort keys', () => {
    expect(isCatalogSortKey(CATALOG_SORT.NAME)).toBe(true);
    expect(isCatalogSortKey('toString')).toBe(false);
    expect(isCatalogSortKey('recent')).toBe(false);
  });
});

describe('filterIntegrations', () => {
  const none = { keyword: '', category: CATEGORY_ALL, connectedOnly: false };

  it('keeps everything without a keyword or toggle', () => {
    expect(filterIntegrations(ALL, none)).toHaveLength(ALL.length);
  });

  it('matches the keyword on the name or key, ignoring case and surrounding space', () => {
    expect(keys(filterIntegrations(ALL, { ...none, keyword: '  GIT ' }))).toEqual(['gitlab', 'github']);
    expect(keys(filterIntegrations(ALL, { ...none, keyword: 'claude_' }))).toEqual(['claude_code']);
  });

  it('keeps only connected integrations when asked', () => {
    expect(keys(filterIntegrations(ALL, { ...none, connectedOnly: true }))).toEqual(['jira', 'github']);
  });

  it('combines the keyword and the toggle', () => {
    expect(keys(filterIntegrations(ALL, { ...none, keyword: 'git', connectedOnly: true }))).toEqual(['github']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterIntegrations(ALL, { ...none, keyword: 'zzz' })).toEqual([]);
  });
});

describe('categories', () => {
  it('filters by category and keeps everything for All', () => {
    expect(keys(filterByCategory(ALL, INTEGRATION_CATEGORY.ISSUES))).toEqual(['asana', 'jira']);
    expect(filterByCategory(ALL, CATEGORY_ALL)).toEqual(ALL);
  });

  it('counts each tab, All first, in the catalog order', () => {
    const tabs = buildCategoryTabs(ALL);
    expect(tabs[0]).toEqual({ key: CATEGORY_ALL, label: COPY.allCategories, count: 5 });
    expect(tabs.slice(1).map(({ key, count }) => [key, count])).toEqual([
      [INTEGRATION_CATEGORY.CODE_SCM, 2],
      [INTEGRATION_CATEGORY.CI_CD, 0],
      [INTEGRATION_CATEGORY.ISSUES, 2],
      [INTEGRATION_CATEGORY.AI_ANALYTICS, 1],
      [INTEGRATION_CATEGORY.CUSTOM, 0],
    ]);
  });

  it('falls back to All for an unknown category in the URL', () => {
    expect(resolveCategory(INTEGRATION_CATEGORY.CI_CD)).toBe(INTEGRATION_CATEGORY.CI_CD);
    expect(resolveCategory('nonsense')).toBe(CATEGORY_ALL);
  });
});

describe('buildOtelBadges', () => {
  it('shows nothing when there is nothing to report', () => {
    expect(buildOtelBadges({ active: 0, recoveryRequired: 0, restartRequired: 0 })).toEqual([]);
  });

  it('shows the three counts, each with its tone', () => {
    expect(buildOtelBadges({ active: 2, recoveryRequired: 1, restartRequired: 3 })).toEqual([
      { tone: STATUS_TONE.SUCCESS, label: COPY.otel.active(2) },
      { tone: STATUS_TONE.ERROR, label: COPY.otel.recovery(1) },
      { tone: STATUS_TONE.WARNING, label: COPY.otel.action(3) },
    ]);
  });

  it('uses the singular for one', () => {
    expect(COPY.otel.active(1)).toBe('1 active credential');
    expect(COPY.otel.action(1)).toBe('1 connection requiring action');
  });
});
