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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IConnectionStatus } from '@/types';
import { CONNECTION_HEALTH_STATE, toUserMessage } from '@/ui';

import { COPY, HEALTH_FAILURE_REASON, HEALTH_STORAGE_KEY, HEALTH_TTL_MS } from './constants';
import {
  countFailed,
  findStaleConnections,
  healthFromTestError,
  healthFromTestResult,
  hydrateHealth,
  isHealthFresh,
  readStoredHealth,
  toHealthView,
  toConnectionActionErrorMessage,
  toTestErrorMessage,
  writeStoredHealth,
} from './health';
import {
  CLEANED_GITHUB_MESSAGE,
  GITHUB_DUMP,
  IGNORED_REQUEST_TEXT,
  MINUTE_MS,
  NOW,
  SECRET_FREE_MESSAGE,
  axiosLike,
  connection,
  offline,
  online,
} from './health.test-utils';
import type { ConnectionHealthEntry, ConnectionHealthMap } from './types';

describe('health entries', () => {
  it('records a passing test as online', () => {
    expect(healthFromTestResult({ success: true, message: 'ok' }, NOW)).toEqual({
      status: IConnectionStatus.ONLINE,
      message: 'ok',
      testedAt: NOW,
    });
  });

  it('records an unsuccessful answer with its classified reason and a clean message', () => {
    expect(healthFromTestResult({ success: false, message: GITHUB_DUMP }, NOW)).toEqual({
      status: IConnectionStatus.OFFLINE,
      reason: HEALTH_FAILURE_REASON.CREDENTIALS,
      message: CLEANED_GITHUB_MESSAGE,
      testedAt: NOW,
    });
  });

  it('records a test that answered unsuccessfully with no known cause as a generic failure', () => {
    expect(healthFromTestResult({ success: false, message: 'missing scope' }, NOW)).toEqual({
      status: IConnectionStatus.OFFLINE,
      reason: HEALTH_FAILURE_REASON.FAILED,
      message: 'missing scope',
      testedAt: NOW,
    });
  });

  it('records a rejected request with its classified reason and raw message', () => {
    expect(healthFromTestError(axiosLike(400, SECRET_FREE_MESSAGE), NOW)).toEqual({
      status: IConnectionStatus.OFFLINE,
      reason: HEALTH_FAILURE_REASON.CREDENTIALS,
      message: SECRET_FREE_MESSAGE,
      testedAt: NOW,
    });
  });
});

describe('freshness', () => {
  it('is fresh inside the window and stale at its edge', () => {
    expect(isHealthFresh(online(NOW - HEALTH_TTL_MS + 1), NOW)).toBe(true);
    expect(isHealthFresh(online(NOW - HEALTH_TTL_MS), NOW)).toBe(false);
    expect(isHealthFresh(undefined, NOW)).toBe(false);
  });

  it('picks the connections with no valid result', () => {
    const health: ConnectionHealthMap = { fresh: online(NOW - MINUTE_MS), old: online(NOW - 2 * HEALTH_TTL_MS) };
    const stale = findStaleConnections([connection('fresh'), connection('old'), connection('never')], health, NOW);
    expect(stale.map((item) => item.unique)).toEqual(['old', 'never']);
  });

  it('counts the failed connections', () => {
    const health: ConnectionHealthMap = { a: offline(NOW), b: online(NOW), c: offline(NOW) };
    expect(countFailed([connection('a'), connection('b'), connection('d')], health)).toBe(1);
  });
});

describe('health view', () => {
  it('reads as not tested without an entry', () => {
    expect(toHealthView(undefined)).toEqual({ state: CONNECTION_HEALTH_STATE.UNKNOWN });
  });

  it('reads a passing test as online with its time and message', () => {
    const entry: ConnectionHealthEntry = { ...online(NOW), message: 'ok' };
    expect(toHealthView(entry)).toEqual({ state: CONNECTION_HEALTH_STATE.ONLINE, testedAt: NOW, message: 'ok' });
  });

  it('labels a failed test with its reason wording and keeps the raw message', () => {
    const entry: ConnectionHealthEntry = {
      status: IConnectionStatus.OFFLINE,
      reason: HEALTH_FAILURE_REASON.CREDENTIALS,
      message: 'bad token',
      testedAt: NOW,
    };
    expect(toHealthView(entry)).toEqual({
      state: CONNECTION_HEALTH_STATE.OFFLINE,
      testedAt: NOW,
      label: COPY.failure[HEALTH_FAILURE_REASON.CREDENTIALS],
      message: 'bad token',
    });
  });
});

describe('test error message', () => {
  it.each([
    [401, COPY.testFailed.credentials],
    [403, COPY.testFailed.credentials],
    [504, COPY.testFailed.unreachable],
    [400, COPY.testFailed.fallback],
  ])('maps a %i response to its wording', (status, expected) => {
    expect(toTestErrorMessage(axiosLike(status, 'raw server text'))).toBe(expected);
  });

  it('falls back when no response came back and never echoes the raw message', () => {
    expect(toTestErrorMessage(new Error('dial tcp 10.0.0.1: i/o timeout'))).toBe(COPY.testFailed.fallback);
  });
});

describe('connection action error message', () => {
  it('uses a cleaned server message when the test request returns a response', () => {
    expect(toConnectionActionErrorMessage(axiosLike(400, GITHUB_DUMP))).toBe(CLEANED_GITHUB_MESSAGE);
  });

  it.each([
    [{ response: { status: 400, data: {} }, message: IGNORED_REQUEST_TEXT }, COPY.testFailed.fallback],
    [{ response: { status: 400, data: { message: 42 } }, message: IGNORED_REQUEST_TEXT }, COPY.testFailed.fallback],
    [{ response: { status: 400, data: { message: '  ' } }, message: IGNORED_REQUEST_TEXT }, COPY.testFailed.fallback],
    [new Error(IGNORED_REQUEST_TEXT), COPY.testFailed.fallback],
  ])('uses safe mapped copy when there is no usable response message', (error, expected) => {
    expect(toConnectionActionErrorMessage(error)).toBe(expected);
  });

  it('honors the caller fallback when the response has no usable reason', () => {
    const fallback = (error: unknown) => toUserMessage(error, { '409': 'Duplicate connection.' }, 'Save failed.');
    expect(toConnectionActionErrorMessage({ response: { status: 409, data: { message: '' } } }, fallback)).toBe(
      'Duplicate connection.',
    );
  });
});

describe('storage', () => {
  const storageFailure = () => {
    throw new Error('blocked');
  };

  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the entries inside the window and drops the expired and malformed ones', () => {
    const raw = {
      fresh: online(NOW - MINUTE_MS),
      expired: online(NOW - 2 * HEALTH_TTL_MS),
      broken: { status: 'online' },
    };
    expect(Object.keys(hydrateHealth(raw, NOW))).toEqual(['fresh']);
    expect(hydrateHealth('nope', NOW)).toEqual({});
  });

  it('round-trips through sessionStorage', () => {
    const health: ConnectionHealthMap = { a: online(Date.now()) };
    writeStoredHealth(health);
    expect(readStoredHealth()).toEqual(health);
  });

  it('reads nothing from corrupt storage', () => {
    window.sessionStorage.setItem(HEALTH_STORAGE_KEY, '{not json');
    expect(readStoredHealth()).toEqual({});
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(storageFailure);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(storageFailure);
    expect(readStoredHealth()).toEqual({});
    expect(() => writeStoredHealth({})).not.toThrow();
  });
});
