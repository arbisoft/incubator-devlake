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
import { message } from 'antd';
import { AxiosError, AxiosHeaders, HttpStatusCode } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { ACCESS_ROLE, ACCESS_STATUS, type AccessDomain, type AccessUser } from '@/api/access';

import { ACCESS_DOMAIN as DOMAIN, ACCESS_USER as USER } from './__tests__/access-fixtures';
import { createDeferred } from './__tests__/test-utils';
import { ACCESS_ERROR, COPY, LIFECYCLE_ACTION, LIFECYCLE_SUBJECT } from './constants';
import type { LifecycleAction } from './types';
import { useLifecycleAction, type LifecycleTarget } from './use-lifecycle-action';

vi.mock('antd', async (importOriginal) => {
  const { withMockedAntdMessage } = await import('./__tests__/test-utils');
  return withMockedAntdMessage(importOriginal);
});

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

const OTHER_USER_ID = 8;
const USER_TARGET: LifecycleTarget = { subject: LIFECYCLE_SUBJECT.USER, item: USER };
const DOMAIN_TARGET: LifecycleTarget = { subject: LIFECYCLE_SUBJECT.DOMAIN, item: DOMAIN };

const setup = () => {
  const onDone = vi.fn();
  const onCredential = vi.fn();
  const hook = renderHook(() => useLifecycleAction({ onDone, onCredential }));
  return { ...hook, onDone, onCredential };
};

type Hook = ReturnType<typeof setup>['result']['current'];

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

  it('sends nothing for an action it does not handle, for a user or a domain', async () => {
    const { result, onDone } = setup();
    const unknown = 'unknown' as LifecycleAction;
    await act(async () => result.current.start(unknown, USER_TARGET));
    await act(async () => result.current.start(unknown, DOMAIN_TARGET));
    expect(access.updateUser).not.toHaveBeenCalled();
    expect(access.updateDomain).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
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
    expect(onDone).toHaveBeenCalledOnce();
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

  describe('role change guard', () => {
    it.each([
      {
        name: 'user',
        target: USER_TARGET,
        arm: () => {
          const deferred = createDeferred<AccessUser>();
          access.updateUser.mockReturnValueOnce(deferred.promise);
          return () => deferred.resolve(USER);
        },
        writes: () => access.updateUser,
        isPending: (hook: Hook) => hook.isUserRolePending(USER.id),
      },
      {
        name: 'domain',
        target: DOMAIN_TARGET,
        arm: () => {
          const deferred = createDeferred<AccessDomain>();
          access.updateDomain.mockReturnValueOnce(deferred.promise);
          return () => deferred.resolve(DOMAIN);
        },
        writes: () => access.updateDomain,
        isPending: (hook: Hook) => hook.isDomainRolePending(DOMAIN.id),
      },
    ])(
      'writes once for two same-tick changes of a $name and marks it pending until it settles',
      async ({ target, arm, writes, isPending }) => {
        const settle = arm();
        const { result, onDone } = setup();
        const { changeRole } = result.current;
        let calls: Promise<void>[] = [];
        act(() => {
          calls = [changeRole(target, ACCESS_ROLE.CUSTOMER_ADMIN), changeRole(target, ACCESS_ROLE.MEMBER)];
        });
        expect(writes()).toHaveBeenCalledTimes(1);
        expect(isPending(result.current)).toBe(true);

        await act(async () => {
          settle();
          await Promise.all(calls);
        });
        expect(isPending(result.current)).toBe(false);
        expect(onDone).toHaveBeenCalledOnce();
      },
    );

    it('keeps another user, and a domain sharing the same id, independent', async () => {
      const deferred = createDeferred<AccessUser>();
      access.updateUser.mockReturnValueOnce(deferred.promise).mockResolvedValue(USER);
      access.updateDomain.mockResolvedValue(DOMAIN);
      const { result } = setup();
      const { changeRole } = result.current;
      const other: LifecycleTarget = { subject: LIFECYCLE_SUBJECT.USER, item: { ...USER, id: OTHER_USER_ID } };
      const sameId: LifecycleTarget = { subject: LIFECYCLE_SUBJECT.DOMAIN, item: { ...DOMAIN, id: USER.id } };
      let calls: Promise<void>[] = [];
      act(() => {
        calls = [
          changeRole(USER_TARGET, ACCESS_ROLE.MEMBER),
          changeRole(other, ACCESS_ROLE.MEMBER),
          changeRole(sameId, ACCESS_ROLE.MEMBER),
        ];
      });
      expect(access.updateUser).toHaveBeenCalledTimes(2);
      expect(access.updateDomain).toHaveBeenCalledTimes(1);

      await act(async () => {
        deferred.resolve(USER);
        await Promise.all(calls);
      });
      expect(result.current.isUserRolePending(USER.id)).toBe(false);
    });

    it('clears pending after a failure and lets the change be retried', async () => {
      access.updateUser.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(USER);
      const { result, onDone } = setup();
      await act(async () => result.current.changeRole(USER_TARGET, ACCESS_ROLE.CUSTOMER_ADMIN));
      expect(result.current.isUserRolePending(USER.id)).toBe(false);
      expect(onDone).toHaveBeenCalledOnce();

      await act(async () => result.current.changeRole(USER_TARGET, ACCESS_ROLE.CUSTOMER_ADMIN));
      expect(access.updateUser).toHaveBeenCalledTimes(2);
      expect(onDone).toHaveBeenCalledTimes(2);
    });
  });

  describe('failure toasts', () => {
    const lastAdminError = () =>
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: HttpStatusCode.BadRequest,
        statusText: 'Bad Request',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: 'keep at least one active customer administrator' },
      });

    it('shows safe copy when a role change is refused', async () => {
      const { result, onDone } = setup();
      access.updateUser.mockRejectedValue(lastAdminError());
      await act(async () => result.current.changeRole(USER_TARGET, ACCESS_ROLE.MEMBER));
      expect(message.error).toHaveBeenCalledWith(ACCESS_ERROR.LAST_ADMIN);
      expect(onDone).toHaveBeenCalledOnce();
    });

    it('shows safe copy when disabling a user or a domain fails, never the raw error', async () => {
      const { result } = setup();
      access.updateUser.mockRejectedValue(lastAdminError());
      access.updateDomain.mockRejectedValue(new Error('error saving access domain: sql'));
      await act(async () => result.current.start(LIFECYCLE_ACTION.DISABLE, USER_TARGET));
      await act(async () => result.current.start(LIFECYCLE_ACTION.DISABLE, DOMAIN_TARGET));
      expect(message.error).toHaveBeenNthCalledWith(1, ACCESS_ERROR.LAST_ADMIN);
      expect(message.error).toHaveBeenNthCalledWith(2, ACCESS_ERROR.REQUEST_FAILED);
    });
  });
});
