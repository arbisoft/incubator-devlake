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

import { extractScopeMeta, type ScopeData, type ScopeItem } from './scope-meta';

const scope = (fullName: string, data?: ScopeData): ScopeItem => ({ id: 'id', name: 'name', fullName, data });

describe('extractScopeMeta', () => {
  it('prefers explicit data over the path', () => {
    expect(
      extractScopeMeta(scope('ignored/1999/01', { year: 2024, month: 5, basePath: '/custom/', accountId: 'a1' })),
    ).toEqual({
      basePath: 'custom',
      year: 2024,
      month: 5,
      prefix: 'ignored/1999/01',
      accountId: 'a1',
    });
  });

  it('reads year and month from a prefix-only path', () => {
    expect(extractScopeMeta(scope('base/2024/05'))).toEqual({
      basePath: 'base',
      year: 2024,
      month: 5,
      prefix: 'base/2024/05',
      accountId: '',
    });
  });

  it('reads a year-only prefix', () => {
    expect(extractScopeMeta(scope('base/2024'))).toEqual({
      basePath: 'base',
      year: 2024,
      month: null,
      prefix: 'base/2024',
      accountId: '',
    });
  });

  it('treats an invalid month segment as no month and no year', () => {
    expect(extractScopeMeta(scope('base/2024/13'))).toEqual({
      basePath: 'base/2024',
      year: null,
      month: null,
      prefix: 'base/2024/13',
      accountId: '',
    });
  });

  it('ignores trailing slashes', () => {
    expect(extractScopeMeta(scope('base/2024/05/'))).toEqual(extractScopeMeta(scope('base/2024/05')));
  });

  it('keeps an explicit year when the month comes from the path', () => {
    const meta = extractScopeMeta(scope('base/2020/07', { year: 2024 }));
    expect(meta).toMatchObject({ year: 2024, month: 7, basePath: 'base' });
  });

  it('takes the prefix from data, then fullName, then id', () => {
    expect(extractScopeMeta(scope('full/2023/01', { prefix: 'data/2024/02' })).prefix).toBe('data/2024/02');
    expect(extractScopeMeta(scope('full/2023/01')).prefix).toBe('full/2023/01');
    const idOnly = { id: 'id/2022/03', name: 'name' } as never;
    expect(extractScopeMeta(idOnly)).toMatchObject({ prefix: 'id/2022/03', year: 2022, month: 3, basePath: 'id' });
  });

  it('returns empty values for empty data', () => {
    expect(extractScopeMeta(scope(''))).toEqual({ basePath: '', year: null, month: null, prefix: '', accountId: '' });
  });
});
