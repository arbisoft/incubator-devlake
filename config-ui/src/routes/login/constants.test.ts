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

import { AxiosError, AxiosHeaders, HttpStatusCode } from 'axios';
import { describe, expect, it } from 'vitest';

import { toUserMessage } from '@/ui/utils';

import { COPY, LOGIN_ERROR_MAP } from './constants';

const failure = (status: number, data: unknown = {}) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

const message = (error: unknown) => toUserMessage(error, LOGIN_ERROR_MAP, COPY.signInFailed);

describe('login error map', () => {
  it('maps a rejected login to the uniform credentials message', () => {
    expect(message(failure(HttpStatusCode.Unauthorized))).toBe(COPY.invalidCredentials);
  });

  it('maps throttling to its own message', () => {
    expect(message(failure(HttpStatusCode.TooManyRequests))).toBe(COPY.tooManyAttempts);
  });

  it('falls back to the generic sign-in failure without echoing the server message', () => {
    expect(message(failure(HttpStatusCode.InternalServerError, { message: 'sql: bad connection' }))).toBe(
      COPY.signInFailed,
    );
    expect(message(failure(HttpStatusCode.BadRequest))).toBe(COPY.signInFailed);
    expect(message(new Error('Network Error'))).toBe(COPY.signInFailed);
  });
});
