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
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { REQUEST_DELAY_MS } from '@/hooks/use-refresh-data/constants';

import { useScopeList } from './use-scope-list';

vi.mock('@/api', () => ({ default: { scope: { list: vi.fn() } } }));

const list = vi.mocked(API.scope.list);

describe('useScopeList requests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    list.mockResolvedValue({ count: 0, scopes: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes abort signals for list queries and aborts the obsolete query', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
    const { result } = renderHook(() => useScopeList('github', 1), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });
    const [[, , , initialSignal]] = list.mock.calls;
    expect(initialSignal).toBeInstanceOf(AbortSignal);

    act(() => result.current.list.setKeyword('release-repositories'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1][2]).toMatchObject({ searchTerm: 'release-repositories' });
    expect(initialSignal?.aborted).toBe(true);
    expect(list.mock.calls[1][3]).toBeInstanceOf(AbortSignal);
  });
});
