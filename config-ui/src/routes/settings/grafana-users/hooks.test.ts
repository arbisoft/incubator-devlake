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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';

import { COPY, GRAFANA_DIALOG, GRAFANA_FLOW_ERRORS } from './constants';
import { useDialogState, useGrafanaRowActions } from './hooks';

vi.mock('antd', async (importOriginal) => {
  const { withMockedAntdMessage } = await import('../__tests__/test-utils');
  return withMockedAntdMessage(importOriginal);
});

vi.mock('@/api', () => ({ default: { grafanaUsers: { updateUser: vi.fn(), deleteUser: vi.fn() } } }));

const grafana = vi.mocked(API.grafanaUsers);

const USER: GrafanaUser = {
  id: 3,
  email: 'ann@example.com',
  name: 'Ann',
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: [],
};

describe('useGrafanaRowActions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    grafana.updateUser.mockResolvedValue(USER);
    grafana.deleteUser.mockResolvedValue(undefined);
  });

  it('changes the role and refreshes the list', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useGrafanaRowActions(onDone));
    await act(() => result.current.changeRole(USER, GRAFANA_ROLE.EDITOR));
    expect(grafana.updateUser).toHaveBeenCalledWith(3, { role: GRAFANA_ROLE.EDITOR });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('refreshes the list after a failed role change and shows the role flow copy', async () => {
    grafana.updateUser.mockRejectedValue({
      response: { status: 403, data: { code: GRAFANA_ERROR_CODE.USER_PROTECTED } },
    });
    const onDone = vi.fn();
    const { result } = renderHook(() => useGrafanaRowActions(onDone));
    await act(() => result.current.changeRole(USER, GRAFANA_ROLE.ADMIN));
    expect(message.error).toHaveBeenCalledWith(GRAFANA_FLOW_ERRORS.ROLE[GRAFANA_ERROR_CODE.USER_PROTECTED]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('asks before disabling, then sends the disabled flag and refreshes', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useGrafanaRowActions(onDone));
    act(() => result.current.requestAction('disable', USER));
    expect(result.current.confirmProps.open).toBe(true);
    expect(result.current.confirmProps.description).toBe(COPY.confirm.disable.description(USER.email));
    expect(grafana.updateUser).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmProps.onConfirm();
    });
    expect(grafana.updateUser).toHaveBeenCalledWith(3, { disabled: true });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('deletes after confirmation', async () => {
    const { result } = renderHook(() => useGrafanaRowActions(vi.fn()));
    act(() => result.current.requestAction('delete', USER));
    expect(result.current.confirmProps.title).toBe(COPY.confirm.delete.title(USER.email));
    await act(async () => {
      await result.current.confirmProps.onConfirm();
    });
    expect(grafana.deleteUser).toHaveBeenCalledWith(3);
  });
});

describe('useDialogState', () => {
  it('opens a dialog for a user with a new session and keeps the user on close', () => {
    const { result } = renderHook(() => useDialogState());
    act(() => result.current.open(GRAFANA_DIALOG.PROJECTS, USER));
    expect(result.current).toMatchObject({ kind: GRAFANA_DIALOG.PROJECTS, user: USER, session: 1 });
    act(() => result.current.close());
    expect(result.current).toMatchObject({ kind: undefined, user: USER, session: 1 });
    act(() => result.current.open(GRAFANA_DIALOG.ADD));
    expect(result.current.session).toBe(2);
  });
});
