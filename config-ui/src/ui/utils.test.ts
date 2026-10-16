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

import { COMMON_COPY, SHORT_DATE_TIME_FORMAT } from './constants';
import { formatDateTime, formatRelativeTime, toRouteTabs, toTabKey, toUserMessage } from './utils';

const NOW = new Date(2026, 8, 4, 16, 20, 0);
const MINUTE = 60_000;

describe('toUserMessage', () => {
  const map = { '409': 'Name already taken', CONFLICT_CODE: 'Conflict' };

  it('maps the response status', () => {
    expect(toUserMessage({ response: { status: 409 } }, map)).toBe(map['409']);
  });

  it('prefers the backend code over the status', () => {
    expect(toUserMessage({ response: { status: 409, data: { code: 'CONFLICT_CODE' } } }, map)).toBe(map.CONFLICT_CODE);
  });

  it('falls back to generic copy and never leaks the raw message', () => {
    expect(toUserMessage(new Error('pq: duplicate key (409)'), map)).toBe(COMMON_COPY.genericError);
    expect(toUserMessage('boom', map)).toBe(COMMON_COPY.genericError);
    expect(toUserMessage(undefined, map, 'custom')).toBe('custom');
  });
});

describe('formatDateTime', () => {
  it('formats local date and time', () => {
    expect(formatDateTime(new Date(2026, 8, 4, 16, 20))).toBe('2026-09-04 16:20');
  });

  it('formats the short form when asked', () => {
    expect(formatDateTime(new Date(2026, 8, 4, 16, 20), SHORT_DATE_TIME_FORMAT)).toBe('4 Sep 2026, 16:20');
  });

  it('renders a placeholder for empty values', () => {
    expect(formatDateTime(null)).toBe(COMMON_COPY.emptyValue);
    expect(formatDateTime(undefined)).toBe(COMMON_COPY.emptyValue);
  });
});

describe('formatRelativeTime', () => {
  it('says just now under a minute', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 10_000), NOW)).toBe(COMMON_COPY.justNow);
  });

  it('formats past and future offsets', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * MINUTE), NOW)).toBe('5 minutes ago');
    expect(formatRelativeTime(new Date(NOW.getTime() + 2 * 60 * MINUTE), NOW)).toBe('in 2 hours');
  });

  it('renders a placeholder for empty values', () => {
    expect(formatRelativeTime(null, NOW)).toBe(COMMON_COPY.emptyValue);
  });
});

describe('toRouteTabs', () => {
  it('builds the tabs in order from labels and paths', () => {
    expect(toRouteTabs(['a', 'b'] as const, { a: 'Alpha', b: 'Beta' }, { a: '/a', b: '/b' })).toEqual([
      { key: 'a', label: 'Alpha', path: '/a' },
      { key: 'b', label: 'Beta', path: '/b' },
    ]);
  });
});

describe('toTabKey', () => {
  it('keeps a known key and falls back otherwise', () => {
    expect(toTabKey(['a', 'b'] as const, 'b', 'a')).toBe('b');
    expect(toTabKey(['a', 'b'] as const, 'x', 'a')).toBe('a');
    expect(toTabKey(['a', 'b'] as const, undefined, 'a')).toBe('a');
  });
});
