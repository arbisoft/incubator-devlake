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

import { ACCESS_STATUS } from '@/api/access/constants';
import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';

import { COPY } from './constants';
import { getUnavailableMessage, getUserIdentity, toGrafanaListParams, toUserStatus } from './utils';

const EMAIL = 'ann@example.com';

const user: GrafanaUser = {
  id: 1,
  email: EMAIL,
  name: 'Ann',
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: [],
};

describe('toGrafanaListParams', () => {
  it('sends the keyword as the query and drops it when empty', () => {
    expect(toGrafanaListParams({ page: 2, pageSize: 25, keyword: 'ann' })).toEqual({
      page: 2,
      pageSize: 25,
      query: 'ann',
    });
    expect(toGrafanaListParams({ page: 1, pageSize: 10, keyword: '' }).query).toBeUndefined();
  });

  it('falls back to the first page size for one the list does not offer', () => {
    expect(toGrafanaListParams({ page: 1, pageSize: 7 }).pageSize).toBe(10);
  });
});

describe('toUserStatus', () => {
  it('maps the disabled flag to a status', () => {
    expect(toUserStatus(user)).toBe(ACCESS_STATUS.ACTIVE);
    expect(toUserStatus({ ...user, disabled: true })).toBe(ACCESS_STATUS.DISABLED);
  });
});

describe('getUserIdentity', () => {
  it('shows the name over the email', () => {
    expect(getUserIdentity(user)).toEqual({ primary: 'Ann', secondary: EMAIL });
  });

  it('shows the email alone when there is no name', () => {
    expect(getUserIdentity({ ...user, name: '' })).toEqual({ primary: EMAIL, secondary: undefined });
  });
});

describe('getUnavailableMessage', () => {
  it('uses the copy of a known status code', () => {
    expect(getUnavailableMessage({ code: GRAFANA_ERROR_CODE.NOT_CONFIGURED })).toBe(
      COPY.errors[GRAFANA_ERROR_CODE.NOT_CONFIGURED],
    );
  });

  it('uses the response code of a failed request', () => {
    const error = { response: { status: 503, data: { code: GRAFANA_ERROR_CODE.NOT_SERVER_ADMIN } } };
    expect(getUnavailableMessage(error)).toBe(COPY.errors[GRAFANA_ERROR_CODE.NOT_SERVER_ADMIN]);
  });

  it('falls back to the unreachable copy for an unknown or missing code', () => {
    const fallback = COPY.errors[GRAFANA_ERROR_CODE.UNAVAILABLE];
    expect(getUnavailableMessage({ code: 'SOMETHING_ELSE' })).toBe(fallback);
    expect(getUnavailableMessage(undefined)).toBe(fallback);
  });
});
