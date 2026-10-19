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

import { ACCESS_ERROR_CODE } from '@/api/access';
import { COMMON_COPY } from '@/ui';
import { toUserMessage } from '@/ui/utils';

import { OIDC_PROVIDER_ERROR_MAP } from './authentication/constants';
import { ACCESS_ERROR, CREATE_DOMAIN_ERROR_MAP, CREATE_USER_ERROR_MAP, LOCAL_CREDENTIAL_ERROR_MAP } from './constants';
import { getLocalCredentialError, getOIDCProviderError } from './utils';

const failure = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('access error maps with toUserMessage', () => {
  it('turns each known access error code into its safe copy', () => {
    const duplicate = failure(HttpStatusCode.BadRequest, { code: ACCESS_ERROR_CODE.DUPLICATE_USER });
    expect(toUserMessage(duplicate, CREATE_USER_ERROR_MAP)).toBe(ACCESS_ERROR.DUPLICATE_USER);
    expect(toUserMessage(duplicate, LOCAL_CREDENTIAL_ERROR_MAP)).toBe(ACCESS_ERROR.LOCAL_DUPLICATE_USER);
    expect(
      toUserMessage(
        failure(HttpStatusCode.BadRequest, { code: ACCESS_ERROR_CODE.INVALID_DOMAIN }),
        CREATE_DOMAIN_ERROR_MAP,
      ),
    ).toBe(ACCESS_ERROR.INVALID_DOMAIN);
    expect(
      toUserMessage(
        failure(HttpStatusCode.ServiceUnavailable, { code: ACCESS_ERROR_CODE.OIDC_PROVIDER_MISSING }),
        OIDC_PROVIDER_ERROR_MAP,
      ),
    ).toBe(ACCESS_ERROR.OIDC_PROVIDER_BLOCKED);
  });

  it('never echoes the server message for an unknown code', () => {
    const unknown = failure(HttpStatusCode.BadRequest, { code: 'SOMETHING_NEW', message: 'sql: duplicate key' });
    expect(toUserMessage(unknown, CREATE_USER_ERROR_MAP)).toBe(COMMON_COPY.genericError);
  });

  it('keeps the status gate: a known code on an unexpected status gets the fallback', () => {
    const wrongStatus = failure(HttpStatusCode.InternalServerError, { code: ACCESS_ERROR_CODE.LAST_LOGIN_METHOD });
    expect(getLocalCredentialError(wrongStatus)).toBe(ACCESS_ERROR.REQUEST_FAILED);
    expect(getOIDCProviderError(wrongStatus)).toBe(ACCESS_ERROR.OIDC_PROVIDER_FAILED);
  });

  it('covers every error code the access api defines for these flows', () => {
    expect(Object.keys(CREATE_USER_ERROR_MAP)).toEqual(
      expect.arrayContaining([ACCESS_ERROR_CODE.DUPLICATE_USER, ACCESS_ERROR_CODE.INVALID_USER]),
    );
    expect(Object.keys(OIDC_PROVIDER_ERROR_MAP)).toHaveLength(6);
  });
});
