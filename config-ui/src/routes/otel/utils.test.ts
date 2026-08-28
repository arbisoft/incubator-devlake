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

import { equal } from 'node:assert/strict';
import { test } from 'node:test';
import { AxiosError, AxiosHeaders, HttpStatusCode } from 'axios';

import { OTEL_CONNECTION_STATUS } from '@/api/otel';

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

test('surfaces only safe project-placement validation errors', () => {
  const validationError = createAxiosError(HttpStatusCode.BadRequest, {
    message: 'project "alpha" does not exist',
  });
  equal(getOtelProjectError(validationError), 'project "alpha" does not exist');

  const unexpectedError = createAxiosError(HttpStatusCode.InternalServerError, {
    message: 'internal database error',
  });
  equal(getOtelProjectError(unexpectedError), OTEL_ERROR.PROJECTS);
  equal(getOtelProjectError(new Error('network error')), OTEL_ERROR.PROJECTS);
});

test('derives a consistent OTel connection display status', () => {
  const ready = {
    connection: { status: OTEL_CONNECTION_STATUS.ACTIVE },
    restartRequired: false,
    recoveryRequired: false,
  };
  equal(getOtelConnectionStatus(ready), OTEL_CONNECTION_DISPLAY_STATUS.READY);

  equal(getOtelConnectionStatus({ ...ready, recoveryRequired: true }), OTEL_CONNECTION_DISPLAY_STATUS.ACTION_REQUIRED);
  equal(getOtelConnectionStatus({ ...ready, restartRequired: true }), OTEL_CONNECTION_DISPLAY_STATUS.ACTION_REQUIRED);
  equal(
    getOtelConnectionStatus({ ...ready, connection: { status: OTEL_CONNECTION_STATUS.REVOKED } }),
    OTEL_CONNECTION_DISPLAY_STATUS.REVOKED,
  );
});
