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

import type { AccessAuditEvent } from '@/api/access';
import { COMMON_COPY, formatDateTime } from '@/ui';

import { COPY } from './constants';
import { filterActivityRows, paginateRows, toActivityRow } from './utils';

const EVENT: AccessAuditEvent = {
  id: 1,
  actorEmail: 'admin@example.com',
  action: 'user.created',
  targetEmail: 'ada@example.com',
  detail: 'role=member',
  createdAt: '2026-09-04T16:20:11Z',
};

describe('toActivityRow', () => {
  it('maps an event to its view model and keeps the event for the raw view', () => {
    expect(toActivityRow(EVENT)).toEqual({
      id: 1,
      when: formatDateTime(EVENT.createdAt),
      action: 'user.created',
      actor: 'admin@example.com',
      target: 'ada@example.com',
      detail: 'role=member',
      event: EVENT,
    });
  });

  it('shows System for a missing actor and a dash for a missing target or detail', () => {
    const row = toActivityRow({ ...EVENT, actorEmail: '', targetEmail: '', detail: '' });
    expect(row).toMatchObject({ actor: COPY.system, target: COMMON_COPY.emptyValue, detail: COMMON_COPY.emptyValue });
  });
});

describe('filterActivityRows', () => {
  const rows = [
    toActivityRow(EVENT),
    toActivityRow({ ...EVENT, id: 2, action: 'domain.added', targetEmail: '', detail: 'example.com' }),
  ];

  it('returns every row for a blank keyword', () => {
    expect(filterActivityRows(rows, '  ')).toBe(rows);
  });

  it('matches the action, actor, target and detail without regard to case', () => {
    expect(filterActivityRows(rows, 'DOMAIN.ADDED').map((row) => row.id)).toEqual([2]);
    expect(filterActivityRows(rows, 'ada@').map((row) => row.id)).toEqual([1]);
    expect(filterActivityRows(rows, 'admin@').map((row) => row.id)).toEqual([1, 2]);
    expect(filterActivityRows(rows, 'example.com').map((row) => row.id)).toEqual([1, 2]);
  });

  it('returns nothing when no field matches', () => {
    expect(filterActivityRows(rows, 'zzz')).toEqual([]);
  });
});

describe('paginateRows', () => {
  const items = [1, 2, 3, 4, 5];

  it('returns the requested page and a short last page', () => {
    expect(paginateRows(items, 1, 2)).toEqual([1, 2]);
    expect(paginateRows(items, 3, 2)).toEqual([5]);
  });

  it('returns nothing past the last page', () => {
    expect(paginateRows(items, 4, 2)).toEqual([]);
  });
});
