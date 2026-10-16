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

import { cronPresets } from '@/config/cron';
import { IBPMode } from '@/types';

import { COPY, CUSTOM_CRON_DEFAULT, DEFAULT_PRESET, FREQUENCY } from './constants';
import {
  findQuickRange,
  formatFrequency,
  formatSkipOnFail,
  formatTimeRange,
  getFrequencyChoice,
  getFrequencyLabel,
  getFrequencyPatch,
  getNextRunTime,
  getQuickRanges,
  setCronField,
  splitCron,
  toSummaryItems,
  toUtcIso,
} from './utils';

const [DAILY] = cronPresets;
const CUSTOM_CRON = '15 3 * * *';
const POLICY = { mode: IBPMode.NORMAL, timeAfter: null, isManual: false, cronConfig: DAILY.config, skipOnFail: false };

describe('sync policy summary', () => {
  it('uses the first cron preset as the default', () => {
    expect(DEFAULT_PRESET).toBe(DAILY);
  });

  it('shows a time range only in normal mode', () => {
    expect(formatTimeRange(IBPMode.ADVANCED, '2024-01-02T00:00:00Z')).toBe(COPY.summary.notAvailable);
    expect(formatTimeRange(IBPMode.NORMAL, '2024-01-02T10:00:00Z')).toContain('to Now');
  });

  it('says all history when no start date is set', () => {
    expect(formatTimeRange(IBPMode.NORMAL, null)).toBe(COPY.summary.allHistory);
  });

  it('labels a preset with its description, and manual and custom without one', () => {
    expect(formatFrequency(false, DAILY.config)).toBe(`${DAILY.label} ${DAILY.description}`);
    expect(formatFrequency(true, DAILY.config)).toBe(FREQUENCY.MANUAL);
    expect(formatFrequency(false, CUSTOM_CRON)).toBe(FREQUENCY.CUSTOM);
  });

  it('gives the short frequency label the list shows', () => {
    expect(getFrequencyLabel(false, DAILY.config)).toBe(DAILY.label);
    expect(getFrequencyLabel(false, CUSTOM_CRON)).toBe(FREQUENCY.CUSTOM);
  });

  it('has no next run for a manual or an invalid schedule', () => {
    expect(getNextRunTime(true, DAILY.config)).toBe('');
    expect(getNextRunTime(false, 'not a cron')).toBeNull();
    expect(getNextRunTime(false, DAILY.config)).toBeTruthy();
  });

  it('writes skip on fail as enabled or disabled', () => {
    expect(formatSkipOnFail(true)).toBe(COPY.summary.enabled);
    expect(formatSkipOnFail(false)).toBe(COPY.summary.disabled);
  });

  it('lists the three summary rows in order', () => {
    expect(toSummaryItems(POLICY).map(({ label }) => label)).toEqual([
      COPY.summary.timeRange,
      COPY.summary.frequency,
      COPY.summary.skipOnFail,
    ]);
  });
});

describe('sync frequency choice', () => {
  it('reads manual, a preset and a custom schedule', () => {
    expect(getFrequencyChoice(true, DAILY.config)).toBe(FREQUENCY.MANUAL);
    expect(getFrequencyChoice(false, cronPresets[1].config)).toBe(cronPresets[1].label);
    expect(getFrequencyChoice(false, CUSTOM_CRON)).toBe(FREQUENCY.CUSTOM);
  });

  it('turns a choice into the fields it changes', () => {
    expect(getFrequencyPatch(FREQUENCY.MANUAL)).toEqual({ isManual: true });
    expect(getFrequencyPatch(FREQUENCY.CUSTOM)).toEqual({ isManual: false, cronConfig: CUSTOM_CRON_DEFAULT });
    expect(getFrequencyPatch(cronPresets[2].label)).toEqual({ isManual: false, cronConfig: cronPresets[2].config });
    expect(getFrequencyPatch('unknown')).toEqual({});
  });
});

describe('custom cron fields', () => {
  it('splits a schedule into five fields and pads a short one', () => {
    expect(splitCron(CUSTOM_CRON)).toEqual(['15', '3', '*', '*', '*']);
    expect(splitCron('15 3')).toEqual(['15', '3', '', '', '']);
  });

  it('replaces one field and keeps the rest', () => {
    expect(setCronField(CUSTOM_CRON, 1, '7')).toBe('15 7 * * *');
    expect(setCronField('* * * * *', 4, '1')).toBe('* * * * 1');
  });
});

describe('quick time ranges', () => {
  const NOW = new Date('2024-06-30T12:00:00Z');

  it('counts back from the given moment', () => {
    const ranges = getQuickRanges(NOW);
    const thirtyDays = ranges.find(({ key }) => key === 'thirtyDays');
    expect(thirtyDays?.date.toISOString().slice(0, 10)).toBe('2024-05-31');
  });

  it('finds the range that starts on the chosen day', () => {
    const ranges = getQuickRanges(NOW);
    const [first] = ranges;
    expect(findQuickRange(ranges, first.date.toISOString())).toBe(first);
    expect(findQuickRange(ranges, null)).toBeUndefined();
    expect(findQuickRange(ranges, '2000-01-01T00:00:00Z')).toBeUndefined();
  });

  it('writes a start date as a UTC timestamp', () => {
    expect(toUtcIso(new Date('2024-05-31T10:20:30Z'))).toMatch(/^2024-05-31T10:20:30\+00:00$/);
  });
});
