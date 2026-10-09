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

import type { ScopeDuplicateGroup } from '@/api/scope';

import { COPY } from './constants';
import type { ScopeItem } from './types';
import { buildDuplicateWarning, getScopeDuplicateId, getScopeLabel } from './utils';

const scope = (id: ID, data: ScopeItem['data'] = {}): Pick<ScopeItem, 'id' | 'data'> => ({ id, data });

const group = (fullName: string, connectionNames: string[], htmlUrl = ''): ScopeDuplicateGroup => ({
  fullName,
  htmlUrl,
  connections: connectionNames.map((connectionName, index) => ({ connectionId: index + 1, connectionName })),
});

describe('getScopeDuplicateId', () => {
  it('prefers the plugin id field on the scope data', () => {
    expect(getScopeDuplicateId('github', scope('x', { githubId: 42 }))).toBe('42');
    expect(getScopeDuplicateId('bitbucket', scope('x', { bitbucketId: 'owner/repo' }))).toBe('owner/repo');
  });

  it('falls back to the item id when the data field is missing or not usable', () => {
    expect(getScopeDuplicateId('github', scope('fallback', { githubId: 0 }))).toBe('fallback');
    expect(getScopeDuplicateId('gitlab', scope(7))).toBe('7');
    expect(getScopeDuplicateId('jira', scope('board'))).toBe('board');
  });

  it('returns nothing when there is no usable id', () => {
    expect(getScopeDuplicateId('github', scope(''))).toBeUndefined();
  });
});

describe('buildDuplicateWarning', () => {
  it('names the repository and the single connection', () => {
    expect(buildDuplicateWarning([group('octocat/hello', ['gh-main'])])).toBe(
      COPY.duplicate.message('octocat/hello', 'Connection "gh-main"'),
    );
  });

  it('falls back to the url, then to a generic label', () => {
    expect(buildDuplicateWarning([group('', ['a'], 'https://github.com/o/r')])).toContain('https://github.com/o/r');
    expect(buildDuplicateWarning([group('', ['a'])])).toContain(COPY.duplicate.thisItem);
  });

  it('lists every distinct connection for several items', () => {
    const message = buildDuplicateWarning([group('o/a', ['one', 'two']), group('o/b', ['two', 'three'])]);
    expect(message).toBe(COPY.duplicate.message(COPY.duplicate.manyItems, 'Connections "one", "two", "three"'));
  });

  it('says another connection when none is named', () => {
    expect(buildDuplicateWarning([group('o/a', [])])).toContain('another connection');
  });
});

describe('getScopeLabel', () => {
  const item = { id: 'id-1', name: 'name', fullName: 'owner/name' };

  it('uses the plugin name, then the full name, the name and the id', () => {
    expect(getScopeLabel('plugin name', item)).toBe('plugin name');
    expect(getScopeLabel('', item)).toBe('owner/name');
    expect(getScopeLabel('', { ...item, fullName: '' })).toBe('name');
    expect(getScopeLabel('', { id: 'id-1', name: '', fullName: '' })).toBe('id-1');
  });
});
