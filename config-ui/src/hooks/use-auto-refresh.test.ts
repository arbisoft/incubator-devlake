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
import { describe, expect, it, vi } from 'vitest';

import { useAutoRefresh } from './use-auto-refresh';

const RETRY = { delay: 20, limit: 2 };
const INTERVAL_MS = 60_000;

describe('useAutoRefresh', () => {
  it('exposes a failed first load instead of leaving an unhandled rejection', async () => {
    const request = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAutoRefresh(request, [], { interval: INTERVAL_MS }));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.data).toBeUndefined();
  });

  it('retries a failed load soon, without waiting for the polling interval', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('loaded');
    const { result } = renderHook(() => useAutoRefresh(request, [], { interval: INTERVAL_MS, retryOnError: RETRY }));
    await waitFor(() => expect(result.current.data).toBe('loaded'));
    expect(result.current.error).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('stops retrying after the limit', async () => {
    const request = vi.fn().mockRejectedValue(new Error('boom'));
    renderHook(() => useAutoRefresh(request, [], { interval: INTERVAL_MS, retryOnError: RETRY }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(RETRY.limit + 1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, RETRY.delay * 3));
    });
    expect(request).toHaveBeenCalledTimes(RETRY.limit + 1);
  });

  it('aborts the in-flight request when its dependencies change', async () => {
    const signals: AbortSignal[] = [];
    const request = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<string>(() => undefined);
    });
    const { rerender, unmount } = renderHook(({ id }) => useAutoRefresh(request, [id], { interval: INTERVAL_MS }), {
      initialProps: { id: 1 },
    });
    rerender({ id: 2 });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
});
