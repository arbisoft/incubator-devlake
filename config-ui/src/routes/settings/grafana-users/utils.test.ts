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

import { describe, expect, it, vi } from 'vitest';

import { ACCESS_ROLE, ACCESS_STATUS, type AccessUser } from '@/api/access';
import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';

import {
  COPY,
  GENERATED_PASSWORD_LENGTH,
  GRAFANA_MENU_ACTION,
  PASSWORD_ALPHABET,
  PASSWORD_MIN_LENGTH,
} from './constants';
import {
  buildCreateBody,
  buildDetailsPatch,
  buildProjectOptions,
  generatePassword,
  getMenuActions,
  getPartialUserId,
  getUnavailableMessage,
  getUserIdentity,
  hasPatchChanges,
  isValidNewUser,
  toDevlakeUserOption,
  toGrafanaListParams,
  toUserStatus,
} from './utils';

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

describe('generatePassword', () => {
  it('makes 24 characters from the alphabet, without ambiguous ones', () => {
    const password = generatePassword();
    expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(GENERATED_PASSWORD_LENGTH).toBe(24);
    expect([...password].every((char) => PASSWORD_ALPHABET.includes(char))).toBe(true);
    expect(PASSWORD_ALPHABET).not.toMatch(/[0O1lI]/);
  });

  it('draws from crypto.getRandomValues and rejects values that would skew the choice', () => {
    const fillWith =
      (value: number) =>
      <T extends ArrayBufferView>(array: T): T => {
        new Uint32Array(array.buffer, array.byteOffset, array.byteLength / Uint32Array.BYTES_PER_ELEMENT).fill(value);
        return array;
      };
    const spy = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementationOnce(fillWith(2 ** 32 - 1))
      .mockImplementationOnce(fillWith(0));
    const password = generatePassword(4, 'abc');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
    expect(password).toBe('aaaa');
  });

  it('gives a different password each time', () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe('isValidNewUser', () => {
  const valid = { email: EMAIL, name: 'Ann', password: 'x'.repeat(PASSWORD_MIN_LENGTH) };

  it('needs a valid email, a name and a long enough password', () => {
    expect(isValidNewUser(valid)).toBe(true);
    expect(isValidNewUser({ ...valid, email: 'ann' })).toBe(false);
    expect(isValidNewUser({ ...valid, name: '  ' })).toBe(false);
    expect(isValidNewUser({ ...valid, password: 'x'.repeat(PASSWORD_MIN_LENGTH - 1) })).toBe(false);
  });
});

describe('buildDetailsPatch', () => {
  it('sends only the fields that changed', () => {
    expect(buildDetailsPatch(user, { name: 'Ann', email: EMAIL })).toEqual({ name: undefined, email: undefined });
    expect(buildDetailsPatch(user, { name: ' Anna ', email: EMAIL })).toEqual({ name: 'Anna', email: undefined });
    expect(buildDetailsPatch(user, { name: 'Ann', email: ' NEW@Example.com ' })).toEqual({
      name: undefined,
      email: 'new@example.com',
    });
  });

  it('reports whether anything changed', () => {
    expect(hasPatchChanges({ name: undefined, email: undefined })).toBe(false);
    expect(hasPatchChanges({ name: 'Anna' })).toBe(true);
  });
});

describe('buildCreateBody', () => {
  it('normalises the email and trims the name', () => {
    expect(
      buildCreateBody({
        email: ' Ann@Example.com ',
        name: ' Ann ',
        password: 'p',
        role: GRAFANA_ROLE.EDITOR,
        projects: ['a'],
      }),
    ).toEqual({ email: EMAIL, name: 'Ann', role: GRAFANA_ROLE.EDITOR, projectNames: ['a'], password: 'p' });
  });
});

describe('getPartialUserId', () => {
  const failed = (data: unknown) => ({ response: { data } });

  it('reads the user id of a partial failure', () => {
    expect(getPartialUserId(failed({ code: GRAFANA_ERROR_CODE.PARTIAL, userId: 9 }))).toBe(9);
    expect(getPartialUserId(failed({ code: GRAFANA_ERROR_CODE.PARTIAL, userId: '9' }))).toBe('9');
  });

  it('ignores other codes, a missing id and non-error values', () => {
    expect(getPartialUserId(failed({ code: GRAFANA_ERROR_CODE.USER_EXISTS, userId: 9 }))).toBeUndefined();
    expect(getPartialUserId(failed({ code: GRAFANA_ERROR_CODE.PARTIAL }))).toBeUndefined();
    expect(getPartialUserId(failed('text'))).toBeUndefined();
    expect(getPartialUserId(undefined)).toBeUndefined();
    expect(getPartialUserId(new Error('x'))).toBeUndefined();
  });
});

describe('buildProjectOptions', () => {
  it('keeps selected names first and drops duplicates', () => {
    expect(buildProjectOptions(['b', 'z'], ['a', 'b'])).toEqual([
      { value: 'b', label: 'b' },
      { value: 'z', label: 'z' },
      { value: 'a', label: 'a' },
    ]);
  });
});

describe('toDevlakeUserOption', () => {
  it('shows name and email, falling back to whichever exists', () => {
    const base: AccessUser = {
      id: 1,
      issuer: 'i',
      subject: 's',
      role: ACCESS_ROLE.MEMBER,
      status: ACCESS_STATUS.ACTIVE,
      hasLocalCredential: false,
      displayName: 'Ann',
      email: EMAIL,
    };
    const option = toDevlakeUserOption(base);
    expect(option).toEqual({ value: 1, label: `Ann (${EMAIL})`, email: EMAIL, name: 'Ann' });
    expect(toDevlakeUserOption({ ...base, displayName: '', email: EMAIL }).label).toBe(EMAIL);
    expect(toDevlakeUserOption({ ...base, email: undefined })).toMatchObject({ label: 'Ann', email: '' });
  });
});

describe('getMenuActions', () => {
  it('offers details and password for a normal account', () => {
    expect(getMenuActions(user)).toEqual([GRAFANA_MENU_ACTION.DETAILS, GRAFANA_MENU_ACTION.PASSWORD]);
  });

  it('offers only details for an SSO account and nothing for a protected one', () => {
    expect(getMenuActions({ ...user, sso: true })).toEqual([GRAFANA_MENU_ACTION.DETAILS]);
    expect(getMenuActions({ ...user, protected: true })).toEqual([]);
  });
});
