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

import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { connectionsSlice } from '@/features/connections';
import type { IConnectionAPI } from '@/types';

import { DELETE_KIND } from './constants';
import type { ScopeRow } from './scope-table';
import { useDeleteFlow } from './use-delete-flow';

vi.mock('@/api', () => ({ default: { scope: { remove: vi.fn() }, connection: { remove: vi.fn() } } }));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return { ...actual, message: { success: vi.fn(), error: vi.fn() } };
});

const scopeRemove = vi.mocked(API.scope.remove);
const connectionRemove = vi.mocked(API.connection.remove);
const SCOPE: ScopeRow = { id: 's1', name: 'org/repo', projects: [] };

const setup = () => {
  const store = configureStore({ reducer: { connections: connectionsSlice.reducer } });
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const handlers = { onConnectionDeleted: vi.fn(), onScopeRemoved: vi.fn(), onBulkConfirmed: vi.fn() };
  const { result } = renderHook(() => useDeleteFlow({ plugin: 'github', connectionId: 5, ...handlers }), { wrapper });
  return { result, handlers };
};

describe('useDeleteFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks first, then deletes the scope with its data', async () => {
    scopeRemove.mockResolvedValue(undefined);
    const { result, handlers } = setup();
    act(() => result.current.request({ kind: DELETE_KIND.SCOPE_DELETE, scope: SCOPE }));
    expect(result.current.confirmProps.open).toBe(true);
    expect(scopeRemove).not.toHaveBeenCalled();
    await act(async () => result.current.confirmProps.onConfirm());
    expect(scopeRemove).toHaveBeenCalledWith('github', 5, 's1', false);
    expect(handlers.onScopeRemoved).toHaveBeenCalledOnce();
    expect(result.current.confirmProps.open).toBe(false);
  });

  it('clears only the historical data for a clear', async () => {
    scopeRemove.mockResolvedValue(undefined);
    const { result } = setup();
    act(() => result.current.request({ kind: DELETE_KIND.SCOPE_CLEAR, scope: SCOPE }));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(scopeRemove).toHaveBeenCalledWith('github', 5, 's1', true);
  });

  it('opens the conflict list when a scope is still in use', async () => {
    scopeRemove.mockRejectedValue({
      response: { status: 409, data: { data: { projects: ['p1'], blueprints: ['b1'] } } },
    });
    const { result, handlers } = setup();
    act(() => result.current.request({ kind: DELETE_KIND.SCOPE_DELETE, scope: SCOPE }));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(result.current.conflictOpen).toBe(true);
    expect(result.current.conflict).toEqual({ kind: 'scope', names: ['p1', 'b1'] });
    expect(result.current.confirmProps.open).toBe(false);
    expect(handlers.onScopeRemoved).not.toHaveBeenCalled();
  });

  it('opens the conflict list when the connection is still in use', async () => {
    connectionRemove.mockRejectedValue({
      response: { status: 409, data: { data: { projects: ['p1'], blueprints: [] } } },
    });
    const { result, handlers } = setup();
    act(() => result.current.request({ kind: DELETE_KIND.CONNECTION, name: 'gh' }));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(result.current.conflict).toEqual({ kind: 'connection', names: ['p1'] });
    expect(handlers.onConnectionDeleted).not.toHaveBeenCalled();
  });

  it('leaves the connection dialog open for a retry when the delete fails for another reason', async () => {
    connectionRemove.mockRejectedValue({ response: { status: 500, data: {} } });
    const { result } = setup();
    act(() => result.current.request({ kind: DELETE_KIND.CONNECTION, name: 'gh' }));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(result.current.confirmProps.open).toBe(true);
    expect(result.current.conflictOpen).toBe(false);
  });

  it('navigates away after the connection is deleted', async () => {
    connectionRemove.mockResolvedValue({} as IConnectionAPI);
    const { result, handlers } = setup();
    act(() => result.current.request({ kind: DELETE_KIND.CONNECTION, name: 'gh' }));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(handlers.onConnectionDeleted).toHaveBeenCalledOnce();
  });

  it('hands a confirmed bulk selection to the progress dialog', async () => {
    const { result, handlers } = setup();
    act(() => result.current.request({ kind: DELETE_KIND.SCOPES_BULK, scopes: [SCOPE] }));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(handlers.onBulkConfirmed).toHaveBeenCalledWith([SCOPE]);
    expect(scopeRemove).not.toHaveBeenCalled();
  });
});
