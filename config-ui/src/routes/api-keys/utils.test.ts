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

import { STATUS_TONE } from '@/ui/constants';

import { EXPIRATION, EXPIRY_STATE, EXPIRY_TONE } from './constants';
import { getExpiresAt, getExpiryState, getExpiryTone, getPathPrefix } from './utils';

const NOW = new Date('2026-10-07T12:00:00.000Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

describe('getExpiryState', () => {
  it('treats a missing expiry as never expiring', () => {
    expect(getExpiryState(undefined, NOW)).toBe(EXPIRY_STATE.NEVER);
    expect(getExpiryState(null, NOW)).toBe(EXPIRY_STATE.NEVER);
    expect(getExpiryState('', NOW)).toBe(EXPIRY_STATE.NEVER);
  });

  it('is expired once the expiry has passed', () => {
    expect(getExpiryState(new Date(NOW - DAY_MS).toISOString(), NOW)).toBe(EXPIRY_STATE.EXPIRED);
  });

  it('is active before the expiry', () => {
    expect(getExpiryState(new Date(NOW + DAY_MS).toISOString(), NOW)).toBe(EXPIRY_STATE.ACTIVE);
  });
});

describe('getExpiryTone', () => {
  it('flags only expired keys with an error tone', () => {
    expect(getExpiryTone(EXPIRY_STATE.EXPIRED)).toBe(STATUS_TONE.ERROR);
    expect(getExpiryTone(EXPIRY_STATE.ACTIVE)).toBeUndefined();
    expect(getExpiryTone(EXPIRY_STATE.NEVER)).toBeUndefined();
  });

  it('covers every expiry state', () => {
    expect(Object.keys(EXPIRY_TONE).sort()).toEqual(Object.values(EXPIRY_STATE).sort());
  });
});

describe('getExpiresAt', () => {
  it.each([
    [EXPIRATION.DAYS_7, 7],
    [EXPIRATION.DAYS_30, 30],
    [EXPIRATION.DAYS_90, 90],
  ])('adds the preset %s to now', (preset, days) => {
    const expiresAt = getExpiresAt(preset, NOW) as string;
    expect(new Date(expiresAt).getTime() - NOW).toBeGreaterThanOrEqual(days * DAY_MS - DAY_MS / 24);
    expect(new Date(expiresAt).getTime() - NOW).toBeLessThanOrEqual(days * DAY_MS + DAY_MS / 24);
  });

  it('omits the expiry for a key that never expires', () => {
    expect(getExpiresAt(EXPIRATION.NEVER, NOW)).toBeUndefined();
  });
});

describe('getPathPrefix', () => {
  it('prefixes the REST path with the origin', () => {
    expect(getPathPrefix('https://devlake.example.com')).toBe('https://devlake.example.com/api/rest/');
  });
});
