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

import { IConnectionStatus, type IConnection } from '@/types';
import { CONNECTION_HEALTH_STATE } from '@/ui';

import { COPY, HEALTH_FAILURE_REASON, HEALTH_STORAGE_KEY, HEALTH_TTL_MS, MESSAGE_MAX_LENGTH } from './constants';
import {
  classifyTestFailure,
  cleanTestMessage,
  countFailed,
  failureLabel,
  findStaleConnections,
  healthFromTestError,
  healthFromTestResult,
  hydrateHealth,
  isHealthFresh,
  readStoredHealth,
  toHealthView,
  toTestErrorMessage,
  toTestFailureInput,
  writeStoredHealth,
} from './health';
import type { ConnectionHealthEntry, ConnectionHealthMap } from './types';

const NOW = 1_700_000_000_000;
const MINUTE_MS = 60_000;
const SECRET_FREE_MESSAGE = 'StatusUnauthorized error when testing connection';

const connection = (unique: string) => ({ unique }) as IConnection;
const online = (testedAt: number): ConnectionHealthEntry => ({ status: IConnectionStatus.ONLINE, testedAt });
const offline = (testedAt: number): ConnectionHealthEntry => ({
  status: IConnectionStatus.OFFLINE,
  reason: HEALTH_FAILURE_REASON.FAILED,
  testedAt,
});
const GITHUB_DUMP = [
  'attached stack trace',
  '  -- stack trace:',
  '  | github.com/apache/incubator-devlake/plugins/github/api.testGithubConnAccessTokenAuth',
  '  | \t/app/plugins/github/api/connection_api.go:212',
  'Wraps: (2) StatusUnauthorized error when testing connection (400)',
  'Error types: (1) *withstack.withStack (2) *errutil.leafError',
].join('\n');
const CONNECT_DUMP = [
  'attached stack trace',
  '  | github.com/apache/incubator-devlake/core/utils.CheckNetwork',
  'Wraps: (2) Failed to connect',
  'Wraps: (3) attached stack trace',
  'Wraps: (4) dial tcp 127.0.0.1:9: connect: connection refused',
].join('\n');
const axiosLike = (status: number | undefined, message?: string) => ({
  message: 'Request failed',
  response: status === undefined ? undefined : { status, data: message ? { message } : undefined },
});

describe('classifyTestFailure', () => {
  it.each([
    [{ status: 401 }, HEALTH_FAILURE_REASON.CREDENTIALS],
    [{ status: 403 }, HEALTH_FAILURE_REASON.CREDENTIALS],
    [{ status: 400, message: SECRET_FREE_MESSAGE }, HEALTH_FAILURE_REASON.CREDENTIALS],
    [{ status: 400, message: 'verify token failed' }, HEALTH_FAILURE_REASON.CREDENTIALS],
    [{ status: 400, message: 'invalid token' }, HEALTH_FAILURE_REASON.CREDENTIALS],
    [{ status: 400, message: 'Bad credentials' }, HEALTH_FAILURE_REASON.CREDENTIALS],
    [{}, HEALTH_FAILURE_REASON.UNREACHABLE],
    [{ message: 'Network Error' }, HEALTH_FAILURE_REASON.UNREACHABLE],
    [{ status: 408 }, HEALTH_FAILURE_REASON.UNREACHABLE],
    [{ status: 502 }, HEALTH_FAILURE_REASON.UNREACHABLE],
    [{ status: 504 }, HEALTH_FAILURE_REASON.UNREACHABLE],
    [{ status: 200, message: GITHUB_DUMP }, HEALTH_FAILURE_REASON.CREDENTIALS],
    [
      { status: 200, message: 'authentication failed (HTTP 401): verify your API credentials' },
      HEALTH_FAILURE_REASON.CREDENTIALS,
    ],
    [{ status: 401, message: 'Invalid token. You may need to edit your token' }, HEALTH_FAILURE_REASON.CREDENTIALS],
    [{ status: 200, message: CONNECT_DUMP }, HEALTH_FAILURE_REASON.UNREACHABLE],
    [{ status: 502, message: 'Failed to resolve DNS' }, HEALTH_FAILURE_REASON.UNREACHABLE],
    [{ status: 400, message: 'dial tcp: i/o timeout' }, HEALTH_FAILURE_REASON.UNREACHABLE],
    [{ status: 400, message: 'endpoint is required' }, HEALTH_FAILURE_REASON.FAILED],
    [{ status: 200, message: 'missing scope read:org' }, HEALTH_FAILURE_REASON.FAILED],
    [{ status: 400 }, HEALTH_FAILURE_REASON.FAILED],
    [{ status: 500, message: 'boom' }, HEALTH_FAILURE_REASON.FAILED],
  ])('maps %j to %s', (input, reason) => {
    expect(classifyTestFailure(input)).toBe(reason);
  });

  it('words each reason from the copy', () => {
    expect(failureLabel(HEALTH_FAILURE_REASON.CREDENTIALS)).toBe(COPY.failure.credentials);
    expect(failureLabel(HEALTH_FAILURE_REASON.UNREACHABLE)).toBe(COPY.failure.unreachable);
    expect(failureLabel(HEALTH_FAILURE_REASON.FAILED)).toBe(COPY.failure.failed);
  });
});

describe('cleanTestMessage', () => {
  it('reduces a Go error dump to its first readable line', () => {
    expect(cleanTestMessage(GITHUB_DUMP)).toBe('StatusUnauthorized error when testing connection (400)');
    expect(cleanTestMessage(CONNECT_DUMP)).toBe('Failed to connect');
  });

  it('leaves a plain message alone and keeps only its first line', () => {
    expect(cleanTestMessage('Invalid token. You may need to edit your token')).toBe(
      'Invalid token. You may need to edit your token',
    );
    expect(cleanTestMessage('first line\nsecond line')).toBe('first line');
  });

  it('has nothing to show for an empty message or a dump with no summary', () => {
    expect(cleanTestMessage(undefined)).toBeUndefined();
    expect(cleanTestMessage('')).toBeUndefined();
    expect(cleanTestMessage('attached stack trace\n  | frame')).toBeUndefined();
  });

  it('caps a long message', () => {
    expect(cleanTestMessage('x'.repeat(MESSAGE_MAX_LENGTH + 50))).toHaveLength(MESSAGE_MAX_LENGTH);
  });
});

describe('toTestFailureInput', () => {
  it('reads the status and the server message from an axios-style error', () => {
    expect(toTestFailureInput(axiosLike(400, SECRET_FREE_MESSAGE))).toEqual({
      status: 400,
      message: SECRET_FREE_MESSAGE,
    });
  });

  it('falls back to the error message when there is no response', () => {
    expect(toTestFailureInput(axiosLike(undefined))).toEqual({ status: undefined, message: 'Request failed' });
  });

  it('copes with values that are not errors', () => {
    expect(toTestFailureInput(undefined)).toEqual({});
    expect(toTestFailureInput('nope')).toEqual({});
  });
});

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
      message: 'StatusUnauthorized error when testing connection (400)',
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

describe('storage', () => {
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
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredHealth()).toEqual({});
    expect(() => writeStoredHealth({})).not.toThrow();
  });
});
