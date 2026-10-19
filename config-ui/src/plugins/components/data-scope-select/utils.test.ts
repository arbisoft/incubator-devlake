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

import { describe, expect, it, vi } from 'vitest';

import type { ScopeSelectItem } from './types';
import { mergeScopeItems, toDataScopeItem, toSelectedOptions } from './utils';

vi.mock('@/plugins/utils', () => ({
  getPluginScopeId: (_plugin: string, scope: { fullName: string }) => scope.fullName,
  getPluginScopeName: (_plugin: string, scope: { name: string }) => scope.name,
}));

const item = (id: ID, title: string): ScopeSelectItem => ({
  id,
  title,
  parentId: null,
  data: { name: title, fullName: String(id) },
});

const FULL_NAME = 'octocat/hello';

describe('toDataScopeItem', () => {
  it('identifies the scope by its plugin id and titles it with its name', () => {
    expect(toDataScopeItem('github', { scope: { name: 'hello', fullName: FULL_NAME } })).toEqual({
      parentId: null,
      id: FULL_NAME,
      title: 'hello',
      data: { name: 'hello', fullName: FULL_NAME },
    });
  });

  it('falls back to the full name for a scope without a plugin name', () => {
    expect(toDataScopeItem('github', { scope: { name: '', fullName: FULL_NAME } }).title).toBe(FULL_NAME);
  });
});

describe('mergeScopeItems', () => {
  it('adds new items and lets a later item replace an earlier one with the same id', () => {
    const merged = mergeScopeItems([item(1, 'old'), item(2, 'two')], [item(1, 'new'), item(3, 'three')]);
    expect(merged.map((it) => [it.id, it.title])).toEqual([
      [1, 'new'],
      [2, 'two'],
      [3, 'three'],
    ]);
  });
});

describe('toSelectedOptions', () => {
  it('labels each selected id with its title, or the id when it is not loaded', () => {
    expect(toSelectedOptions([1, '9'], [item(1, 'one')])).toEqual([
      { label: 'one', value: 1 },
      { label: '9', value: '9' },
    ]);
  });
});
