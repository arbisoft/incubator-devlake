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

import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { STATUS_TONE } from '@/ui';

import { COPY, DEFAULT_FILTERS } from './constants';
import { buildHistoryQuery, getBanner, getStatusTone, summarizeRecipients, toDateRange } from './utils';

describe('buildHistoryQuery', () => {
  it('sends the search box as search and leaves empty filters out', () => {
    expect(buildHistoryQuery({ page: 2, pageSize: 20, keyword: 'ali' }, DEFAULT_FILTERS)).toEqual({
      page: 2,
      pageSize: 20,
      sortBy: undefined,
      sortOrder: undefined,
      search: 'ali',
      status: undefined,
      template: undefined,
      projectName: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it('passes every filter and the sort', () => {
    const filters = { status: 'FAILED', template: 'alert', projectName: 'DevLake', from: 'f', to: 't' };
    expect(buildHistoryQuery({ page: 1, pageSize: 50, sortBy: 'sentOn', sortOrder: 'asc' }, filters)).toMatchObject({
      sortBy: 'sentOn',
      sortOrder: 'asc',
      ...filters,
    });
  });
});

describe('toDateRange', () => {
  it('covers both whole days in RFC 3339 without milliseconds', () => {
    const { from, to } = toDateRange(new Date(2026, 10, 1, 15), new Date(2026, 10, 2, 3));
    expect(from).toBe(dayjs('2026-11-01T00:00:00').toDate().toISOString().replace('.000Z', 'Z'));
    expect(to).toBe(dayjs('2026-11-02T23:59:59').toDate().toISOString().replace('.000Z', 'Z'));
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('clears a missing end', () => {
    expect(toDateRange(null, null)).toEqual({ from: '', to: '' });
  });
});

describe('summarizeRecipients', () => {
  it('counts only what is hidden', () => {
    expect(summarizeRecipients(['a', 'b'])).toEqual({ shown: 'a, b', more: 0 });
    expect(summarizeRecipients(['a', 'b', 'c'])).toEqual({ shown: 'a, b', more: 1 });
    expect(summarizeRecipients([])).toEqual({ shown: '', more: 0 });
  });
});

describe('getStatusTone', () => {
  it('maps each status and falls back to neutral', () => {
    expect(getStatusTone('SENT')).toBe(STATUS_TONE.SUCCESS);
    expect(getStatusTone('FAILED')).toBe(STATUS_TONE.ERROR);
    expect(getStatusTone('QUEUED')).toBe(STATUS_TONE.INFO);
    expect(getStatusTone('BOUNCED')).toBe(STATUS_TONE.NEUTRAL);
  });
});

describe('getBanner', () => {
  const base = {
    enabled: true,
    driver: 'smtp',
    host: 'smtp.gmail.com',
    port: 587,
    fromAddress: 'a@b.com',
    fromName: 'D',
  };

  it('names the host when mail is on', () => {
    expect(getBanner(base, false)).toEqual({
      tone: STATUS_TONE.SUCCESS,
      message: COPY.banner.on('smtp.gmail.com:587'),
    });
  });

  it('explains the log driver', () => {
    expect(getBanner({ ...base, driver: 'log', host: undefined, port: undefined }, false).message).toBe(
      COPY.banner.onLog,
    );
  });

  it('shows why mail is off', () => {
    expect(getBanner({ ...base, enabled: false, disabledReason: 'SMTP_HOST is required' }, false)).toEqual({
      tone: STATUS_TONE.WARNING,
      message: COPY.banner.offReason('SMTP_HOST is required'),
    });
    expect(getBanner({ ...base, enabled: false }, false).message).toBe(COPY.banner.off);
  });

  it('reports a failed status load and stays empty while loading', () => {
    expect(getBanner(undefined, true).message).toBe(COPY.banner.failed);
    expect(getBanner(undefined, false).message).toBe('');
  });
});
