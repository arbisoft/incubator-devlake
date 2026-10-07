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
import { AxiosError, AxiosHeaders, HttpStatusCode } from 'axios';

import { OTEL_CONNECTION_STATUS } from '../../api/otel/types';

import { OTEL_CONNECTION_DISPLAY_STATUS, OTEL_ERROR } from './constants';
import { getOtelConnectionStatus, getOtelProjectError } from './utils';

const createAxiosError = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: status === HttpStatusCode.BadRequest ? 'Bad Request' : 'Internal Server Error',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('routes/otel/utils', () => {
  it('surfaces only safe project-placement validation errors', () => {
    const validationError = createAxiosError(HttpStatusCode.BadRequest, {
      message: 'project "alpha" does not exist',
    });
    expect(getOtelProjectError(validationError)).toBe('project "alpha" does not exist');

    const unexpectedError = createAxiosError(HttpStatusCode.InternalServerError, {
      message: 'internal database error',
    });
    expect(getOtelProjectError(unexpectedError)).toBe(OTEL_ERROR.PROJECTS);
    expect(getOtelProjectError(new Error('network error'))).toBe(OTEL_ERROR.PROJECTS);
  });

  it('derives a consistent OTel connection display status', () => {
    const ready = {
      connection: { status: OTEL_CONNECTION_STATUS.ACTIVE },
      restartRequired: false,
      recoveryRequired: false,
    };
    expect(getOtelConnectionStatus(ready)).toBe(OTEL_CONNECTION_DISPLAY_STATUS.READY);

    expect(getOtelConnectionStatus({ ...ready, recoveryRequired: true })).toBe(
      OTEL_CONNECTION_DISPLAY_STATUS.ACTION_REQUIRED,
    );
    expect(getOtelConnectionStatus({ ...ready, restartRequired: true })).toBe(
      OTEL_CONNECTION_DISPLAY_STATUS.ACTION_REQUIRED,
    );
    expect(getOtelConnectionStatus({ ...ready, connection: { status: OTEL_CONNECTION_STATUS.REVOKED } })).toBe(
      OTEL_CONNECTION_DISPLAY_STATUS.REVOKED,
    );
  });
});
