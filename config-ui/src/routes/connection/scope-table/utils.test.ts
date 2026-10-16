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

import type { ScopeRow } from './types';
import { pruneSelection, selectedScopes, toScopeRows } from './utils';

const row = (id: ID, name = `scope-${id}`): ScopeRow => ({ id, name, projects: [] });

describe('toScopeRows', () => {
  it('maps a scope with its project links and scope config', () => {
    const rows = toScopeRows('github', [
      {
        scope: { githubId: 7, name: 'repo', fullName: 'org/repo' } as never,
        scopeConfig: { id: 3, name: 'shared' },
        blueprints: [{ projectName: 'p1' }, { projectName: 'p2' }],
      },
    ]);
    expect(rows).toEqual([{ id: '7', name: 'org/repo', projects: ['p1', 'p2'], configId: 3, configName: 'shared' }]);
  });

  it('leaves projects empty and the config unset when there are none', () => {
    const [first] = toScopeRows('github', [{ scope: { githubId: 1, name: 'repo', fullName: '' } as never }]);
    expect(first).toMatchObject({ name: 'repo', projects: [], configId: undefined });
  });

  it('returns no rows before the data arrives', () => {
    expect(toScopeRows('github', undefined)).toEqual([]);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are no longer on screen', () => {
    expect(pruneSelection(['1', '9'], [row('1'), row('2')])).toEqual(['1']);
  });

  it('returns the same array when every id is still present', () => {
    const selected: ID[] = ['1', '2'];
    expect(pruneSelection(selected, [row('1'), row('2'), row('3')])).toBe(selected);
  });

  it('clears the selection when the page has no rows', () => {
    expect(pruneSelection(['1'], [])).toEqual([]);
  });
});

describe('selectedScopes', () => {
  it('returns the selected rows in selection order and skips unknown ids', () => {
    expect(selectedScopes(['2', '9', '1'], [row('1'), row('2')]).map((item) => item.id)).toEqual(['2', '1']);
  });
});
