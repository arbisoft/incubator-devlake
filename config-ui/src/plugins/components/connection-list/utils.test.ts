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

import type { ConnectionHealthEntry, ConnectionHealthMap } from '@/features/connections';
import { IConnectionStatus, type IConnection } from '@/types';
import { SORT_ORDER } from '@/ui';

import { CONNECTION_FILTER, COPY } from './constants';
import { buildFilterTabs, filterConnections, pageOf, sortConnections, toRepoCount } from './utils';

const connection = (id: number, name: string) => ({ id, name, unique: `github-${id}` }) as IConnection;
const entry = (status: ConnectionHealthEntry['status']): ConnectionHealthEntry => ({ status, testedAt: 1 });

const ALPHA = connection(1, 'alpha');
const BRAVO = connection(2, 'bravo');
const CHARLIE = connection(3, 'charlie');
const DELTA = connection(4, 'delta');
const CONNECTIONS = [BRAVO, ALPHA, CHARLIE, DELTA];

const HEALTH: ConnectionHealthMap = {
  [ALPHA.unique]: entry(IConnectionStatus.ONLINE),
  [BRAVO.unique]: entry(IConnectionStatus.OFFLINE),
  [CHARLIE.unique]: entry(IConnectionStatus.ONLINE),
};

describe('filterConnections', () => {
  it('keeps every connection, tested or not, under All', () => {
    expect(filterConnections(CONNECTIONS, HEALTH, CONNECTION_FILTER.ALL)).toEqual(CONNECTIONS);
  });

  it('keeps only the passing ones under Connected', () => {
    expect(filterConnections(CONNECTIONS, HEALTH, CONNECTION_FILTER.CONNECTED)).toEqual([ALPHA, CHARLIE]);
  });

  it('keeps only the failing ones under Failed and leaves untested ones out of both', () => {
    expect(filterConnections(CONNECTIONS, HEALTH, CONNECTION_FILTER.FAILED)).toEqual([BRAVO]);
  });
});

describe('buildFilterTabs', () => {
  it('counts each tab from the health state', () => {
    expect(buildFilterTabs(CONNECTIONS, HEALTH)).toEqual([
      { key: CONNECTION_FILTER.ALL, label: COPY.filters.all, count: 4 },
      { key: CONNECTION_FILTER.CONNECTED, label: COPY.filters.connected, count: 2 },
      { key: CONNECTION_FILTER.FAILED, label: COPY.filters.failed, count: 1 },
    ]);
  });

  it('counts nothing as connected or failed before any test ran', () => {
    const counts = buildFilterTabs(CONNECTIONS, {}).map(({ count }) => count);
    expect(counts).toEqual([4, 0, 0]);
  });
});

describe('sortConnections', () => {
  it('keeps the given order without a sort', () => {
    expect(sortConnections(CONNECTIONS)).toBe(CONNECTIONS);
  });

  it('sorts by name in both directions without changing the input', () => {
    const names = (list: IConnection[]) => list.map(({ name }) => name);
    expect(names(sortConnections(CONNECTIONS, { sortBy: 'name', sortOrder: SORT_ORDER.ASC }))).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ]);
    expect(names(sortConnections(CONNECTIONS, { sortBy: 'name', sortOrder: SORT_ORDER.DESC }))).toEqual([
      'delta',
      'charlie',
      'bravo',
      'alpha',
    ]);
    expect(names(CONNECTIONS)).toEqual(['bravo', 'alpha', 'charlie', 'delta']);
  });
});

describe('pageOf', () => {
  it.each([
    [1, [1, 2]],
    [2, [3, 4]],
    [3, [5]],
    [4, []],
  ])('returns page %i', (page, expected) => {
    expect(pageOf([1, 2, 3, 4, 5], page, 2)).toEqual(expected);
  });
});

describe('toRepoCount', () => {
  it('reads the count of the response', () => {
    expect(toRepoCount({ count: 7 })).toBe(7);
    expect(toRepoCount({ count: 0 })).toBe(0);
  });

  it('reads anything else as unknown', () => {
    expect(toRepoCount({})).toBeNull();
    expect(toRepoCount({ count: '7' })).toBeNull();
  });
});
