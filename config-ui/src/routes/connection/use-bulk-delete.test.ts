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

import { DETAIL_COPY, DELETE_ERROR_MAP } from './constants';
import type { ScopeRow } from './scope-table';
import { useBulkDelete } from './use-bulk-delete';

vi.mock('@/api', () => ({ default: { scope: { remove: vi.fn() } } }));

const remove = vi.mocked(API.scope.remove);
const scope = (id: string): ScopeRow => ({ id, name: `scope-${id}`, projects: [] });

describe('useBulkDelete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes every scope, records failures with a mapped reason and reports when done', async () => {
    remove.mockImplementation(async (_plugin, _connection, id) => {
      if (id === '2') throw { response: { status: 409, data: { message: 'raw server text' } } };
    });
    const onFinished = vi.fn();
    const { result } = renderHook(() => useBulkDelete({ plugin: 'github', connectionId: 1, onFinished }));

    await act(async () => result.current.start([scope('1'), scope('2'), scope('3')]));

    expect(remove).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledWith('github', 1, '1', false);
    const { state } = result.current;
    expect(state).toMatchObject({ open: true, running: false, total: 3, completed: 3 });
    expect(state.outcomes.filter((outcome) => outcome.error === undefined)).toHaveLength(2);
    expect(state.outcomes.find((outcome) => outcome.id === '2')?.error).toBe(DELETE_ERROR_MAP['409']);
    expect(onFinished).toHaveBeenCalledOnce();
  });

  it('falls back to the generic reason for an unmapped failure', async () => {
    remove.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBulkDelete({ plugin: 'github', connectionId: 1, onFinished: vi.fn() }));
    await act(async () => result.current.start([scope('1')]));
    expect(result.current.state.outcomes[0].error).toBe(DETAIL_COPY.errors.failed);
  });

  it('closes and resets once finished', async () => {
    remove.mockResolvedValue(undefined);
    const { result } = renderHook(() => useBulkDelete({ plugin: 'github', connectionId: 1, onFinished: vi.fn() }));
    await act(async () => result.current.start([scope('1')]));
    act(() => result.current.close());
    expect(result.current.state.open).toBe(false);
    act(() => result.current.reset());
    expect(result.current.state.total).toBe(0);
  });
});
