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

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import type { IConnection } from '@/types';

import { REPO_COUNT_CONCURRENCY, REPO_COUNT_QUERY } from './constants';
import { useRepoCounts } from './use-repo-counts';

vi.mock('@/api', () => ({ default: { scope: { list: vi.fn() } } }));

const listMock = vi.mocked(API.scope.list);
const connection = (id: number) => ({ unique: `github-${id}`, plugin: 'github', id }) as IConnection;
const response = (count: number) => ({ count, scopes: [] });

describe('useRepoCounts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks for one scope per connection and keeps its total', async () => {
    listMock.mockResolvedValue(response(3));
    const { result } = renderHook(() => useRepoCounts());
    act(() => result.current.load(connection(1)));
    await waitFor(() => expect(result.current.counts['github-1']).toBe(3));
    expect(listMock).toHaveBeenCalledWith('github', 1, REPO_COUNT_QUERY);
  });

  it('records a failed count as unknown without throwing', async () => {
    listMock.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useRepoCounts());
    act(() => result.current.load(connection(1)));
    await waitFor(() => expect(result.current.counts['github-1']).toBeNull());
  });

  it('loads each connection once', async () => {
    listMock.mockResolvedValue(response(1));
    const { result } = renderHook(() => useRepoCounts());
    act(() => {
      result.current.load(connection(1));
      result.current.load(connection(1));
    });
    await waitFor(() => expect(result.current.counts['github-1']).toBe(1));
    act(() => result.current.load(connection(1)));
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('keeps at most the queue limit in flight', async () => {
    const resolvers: Array<() => void> = [];
    listMock.mockImplementation(() => new Promise((resolve) => resolvers.push(() => resolve(response(1)))));
    const { result } = renderHook(() => useRepoCounts());
    const total = REPO_COUNT_CONCURRENCY + 2;
    act(() => {
      for (let id = 1; id <= total; id += 1) result.current.load(connection(id));
    });
    expect(listMock).toHaveBeenCalledTimes(REPO_COUNT_CONCURRENCY);
    await act(async () => resolvers.shift()?.());
    expect(listMock).toHaveBeenCalledTimes(REPO_COUNT_CONCURRENCY + 1);
    await act(async () => resolvers.splice(0).forEach((resolve) => resolve()));
    await waitFor(() => expect(Object.keys(result.current.counts)).toHaveLength(REPO_COUNT_CONCURRENCY + 1));
    await act(async () => resolvers.splice(0).forEach((resolve) => resolve()));
    await waitFor(() => expect(Object.keys(result.current.counts)).toHaveLength(total));
  });
});
