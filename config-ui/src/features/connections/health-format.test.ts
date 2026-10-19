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

import { COPY, HEALTH_FAILURE_REASON, MESSAGE_MAX_LENGTH } from './constants';
import { classifyTestFailure, cleanTestMessage, failureLabel, toTestFailureInput } from './health';
import {
  CLEANED_GITHUB_MESSAGE,
  CONNECT_DUMP,
  GITHUB_DUMP,
  INVALID_TOKEN_MESSAGE,
  SECRET_FREE_MESSAGE,
  axiosLike,
} from './health.test-utils';

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
    [{ status: 401, message: INVALID_TOKEN_MESSAGE }, HEALTH_FAILURE_REASON.CREDENTIALS],
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
    expect(cleanTestMessage(GITHUB_DUMP)).toBe(CLEANED_GITHUB_MESSAGE);
    expect(cleanTestMessage(CONNECT_DUMP)).toBe('Failed to connect');
  });

  it('leaves a plain message alone and keeps only its first line', () => {
    expect(cleanTestMessage(INVALID_TOKEN_MESSAGE)).toBe(INVALID_TOKEN_MESSAGE);
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
