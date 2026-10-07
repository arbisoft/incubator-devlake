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

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { ACCESS_ROLE, ACCESS_STATUS, type AccessDomain, type AccessUser } from '@/api/access';

import { COPY, LIFECYCLE_ACTION, LIFECYCLE_SUBJECT } from './constants';
import { useLifecycleAction, type LifecycleTarget } from './use-lifecycle-action';

vi.mock('@/api', () => ({
  default: {
    access: {
      updateUser: vi.fn(),
      updateDomain: vi.fn(),
      hideUser: vi.fn(),
      hideDomain: vi.fn(),
      resetLocalCredential: vi.fn(),
      removeLocalCredential: vi.fn(),
    },
  },
}));

const access = vi.mocked(API.access);

const USER: AccessUser = {
  id: 7,
  issuer: 'issuer',
  subject: 'subject',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: ACCESS_ROLE.MEMBER,
  status: ACCESS_STATUS.ACTIVE,
  hasLocalCredential: true,
};
const DOMAIN: AccessDomain = {
  id: 3,
  domain: 'example.com',
  defaultRole: ACCESS_ROLE.CUSTOMER_ADMIN,
  status: ACCESS_STATUS.ACTIVE,
};
const USER_TARGET: LifecycleTarget = { subject: LIFECYCLE_SUBJECT.USER, item: USER };
const DOMAIN_TARGET: LifecycleTarget = { subject: LIFECYCLE_SUBJECT.DOMAIN, item: DOMAIN };

const setup = () => {
  const onDone = vi.fn();
  const onCredential = vi.fn();
  const hook = renderHook(() => useLifecycleAction({ onDone, onCredential }));
  return { ...hook, onDone, onCredential };
};

describe('useLifecycleAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disables and enables a user at once, keeping the role', async () => {
    const { result, onDone } = setup();
    access.updateUser.mockResolvedValue(USER);
    await act(async () => result.current.start(LIFECYCLE_ACTION.DISABLE, USER_TARGET));
    expect(access.updateUser).toHaveBeenCalledWith(7, { role: ACCESS_ROLE.MEMBER, status: ACCESS_STATUS.DISABLED });
    await act(async () =>
      result.current.start(LIFECYCLE_ACTION.ENABLE, {
        subject: LIFECYCLE_SUBJECT.USER,
        item: { ...USER, status: ACCESS_STATUS.DISABLED },
      }),
    );
    expect(access.updateUser).toHaveBeenLastCalledWith(7, { role: ACCESS_ROLE.MEMBER, status: ACCESS_STATUS.ACTIVE });
    expect(result.current.confirmProps.open).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it('disables a domain at once, keeping the default role', async () => {
    const { result, onDone } = setup();
    access.updateDomain.mockResolvedValue(DOMAIN);
    await act(async () => result.current.start(LIFECYCLE_ACTION.DISABLE, DOMAIN_TARGET));
    expect(access.updateDomain).toHaveBeenCalledWith(3, {
      defaultRole: ACCESS_ROLE.CUSTOMER_ADMIN,
      status: ACCESS_STATUS.DISABLED,
    });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('asks before hiding a user, naming the person, and sends nothing until confirmed', async () => {
    const { result, onDone } = setup();
    access.hideUser.mockResolvedValue(USER);
    act(() => result.current.start(LIFECYCLE_ACTION.HIDE, USER_TARGET));
    expect(result.current.confirmProps).toMatchObject({
      open: true,
      title: COPY.confirm.hideUser.title(),
      description: COPY.confirm.hideUser.description('ada@example.com'),
      confirmLabel: COPY.confirm.hideUser.confirm,
    });
    expect(access.hideUser).not.toHaveBeenCalled();
    await act(async () => result.current.confirmProps.onConfirm());
    expect(access.hideUser).toHaveBeenCalledWith(7);
    expect(result.current.confirmProps.open).toBe(false);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('asks before hiding a domain and cancels without a request', async () => {
    const { result, onDone } = setup();
    act(() => result.current.start(LIFECYCLE_ACTION.HIDE, DOMAIN_TARGET));
    expect(result.current.confirmProps.description).toBe(COPY.confirm.hideDomain.description('example.com'));
    act(() => result.current.confirmProps.onCancel());
    expect(result.current.confirmProps.open).toBe(false);
    expect(access.hideDomain).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('keeps the confirmation open when the request fails', async () => {
    const { result, onDone } = setup();
    access.hideDomain.mockRejectedValue(new Error('boom'));
    act(() => result.current.start(LIFECYCLE_ACTION.HIDE, DOMAIN_TARGET));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(result.current.confirmProps.open).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('hands the new one-time password to the caller after a reset', async () => {
    const { result, onCredential, onDone } = setup();
    const credential = { user: USER, loginName: 'ada', temporaryPassword: 'secret-value' };
    access.resetLocalCredential.mockResolvedValue(credential);
    act(() => result.current.start(LIFECYCLE_ACTION.RESET_PASSWORD, USER_TARGET));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(access.resetLocalCredential).toHaveBeenCalledWith(7);
    expect(onCredential).toHaveBeenCalledWith(credential);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('removes a local password only after a confirmation', async () => {
    const { result } = setup();
    access.removeLocalCredential.mockResolvedValue(USER);
    act(() => result.current.start(LIFECYCLE_ACTION.REMOVE_PASSWORD, USER_TARGET));
    expect(access.removeLocalCredential).not.toHaveBeenCalled();
    await act(async () => result.current.confirmProps.onConfirm());
    expect(access.removeLocalCredential).toHaveBeenCalledWith(7);
  });

  it('changes a user role and a domain default role without touching their status', async () => {
    const { result, onDone } = setup();
    access.updateUser.mockResolvedValue(USER);
    access.updateDomain.mockResolvedValue(DOMAIN);
    await act(async () => result.current.changeRole(USER_TARGET, ACCESS_ROLE.CUSTOMER_ADMIN));
    expect(access.updateUser).toHaveBeenCalledWith(7, {
      role: ACCESS_ROLE.CUSTOMER_ADMIN,
      status: ACCESS_STATUS.ACTIVE,
    });
    await act(async () => result.current.changeRole(DOMAIN_TARGET, ACCESS_ROLE.MEMBER));
    expect(access.updateDomain).toHaveBeenCalledWith(3, {
      defaultRole: ACCESS_ROLE.MEMBER,
      status: ACCESS_STATUS.ACTIVE,
    });
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
