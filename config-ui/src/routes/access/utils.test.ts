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

import { ACCESS_ERROR_CODE } from '@/api/access';

import {
  ACCESS_ERROR,
  getCreateDomainError,
  getCreateUserError,
  isValidDomain,
  isValidEmail,
  normalizeDomain,
} from './utils';

const createAxiosError = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: status === 400 ? 'Bad Request' : 'Internal Server Error',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

test('normalizes allowed-domain input before it is submitted', () => {
  equal(normalizeDomain(' Example.COM '), 'example.com');
});

test('rejects invalid allowed-domain input locally', () => {
  equal(isValidDomain('example.com'), true);
  equal(isValidDomain('example'), true);
  equal(isValidDomain(''), false);
  equal(isValidDomain('example..com'), false);
  equal(isValidDomain('person@example.com'), false);
  equal(isValidDomain('@example.com'), false);
  equal(isValidDomain('example.com.'), false);
});

test('rejects invalid email input locally', () => {
  equal(isValidEmail('person@example.com'), true);
  equal(isValidEmail('person@example'), true);
  equal(isValidEmail('@example.com'), false);
  equal(isValidEmail('person@example.com '), true);
  equal(isValidEmail('person @example.com'), false);
  equal(isValidEmail('person@example..com'), false);
});

test('maps create-user error codes to safe UI copy', () => {
  const duplicateErr = createAxiosError(HttpStatusCode.BadRequest, {
    code: ACCESS_ERROR_CODE.DUPLICATE_USER,
    message: 'this email already has a DevLake access entry',
  });
  equal(getCreateUserError(duplicateErr), ACCESS_ERROR.DUPLICATE_USER);

  const invalidErr = createAxiosError(HttpStatusCode.BadRequest, {
    code: ACCESS_ERROR_CODE.INVALID_USER,
    message: 'provide a valid email and role',
  });
  equal(getCreateUserError(invalidErr), ACCESS_ERROR.INVALID_USER);

  const serverErr = createAxiosError(HttpStatusCode.InternalServerError, {
    message: 'internal server error',
  });
  equal(getCreateUserError(serverErr), ACCESS_ERROR.REQUEST_FAILED);

  equal(getCreateUserError(new Error('network error')), ACCESS_ERROR.REQUEST_FAILED);
});

test('maps create-domain error codes to safe UI copy', () => {
  const duplicateErr = createAxiosError(HttpStatusCode.BadRequest, {
    code: ACCESS_ERROR_CODE.DUPLICATE_DOMAIN,
    message: 'this domain already has a DevLake access policy',
  });
  equal(getCreateDomainError(duplicateErr), ACCESS_ERROR.DUPLICATE_DOMAIN);

  const invalidErr = createAxiosError(HttpStatusCode.BadRequest, {
    code: ACCESS_ERROR_CODE.INVALID_DOMAIN,
    message: 'provide a valid domain and default role',
  });
  equal(getCreateDomainError(invalidErr), ACCESS_ERROR.INVALID_DOMAIN);

  const serverErr = createAxiosError(HttpStatusCode.InternalServerError, {
    message: 'internal server error',
  });
  equal(getCreateDomainError(serverErr), ACCESS_ERROR.REQUEST_FAILED);

  equal(getCreateDomainError(new Error('network error')), ACCESS_ERROR.REQUEST_FAILED);
});

