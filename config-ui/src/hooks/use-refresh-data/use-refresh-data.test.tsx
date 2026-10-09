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

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { StrictMode, Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REQUEST_DELAY_MS } from './constants';

import { useRefreshData } from './index';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

afterEach(() => vi.useRealTimers());

describe('useRefreshData', () => {
  it('does not start a request for an abandoned suspended render', async () => {
    vi.useFakeTimers();
    const request = vi.fn(() => Promise.resolve('data'));
    const never = new Promise<void>(() => undefined);
    const SuspendedReader = () => {
      useRefreshData(request);
      throw never;
    };

    const { unmount } = render(
      <Suspense fallback={<span>loading</span>}>
        <SuspendedReader />
      </Suspense>,
    );
    await act(async () => vi.advanceTimersByTime(REQUEST_DELAY_MS * 2));

    expect(screen.getByText('loading')).toBeDefined();
    expect(request).not.toHaveBeenCalled();
    unmount();
  });

  it('clears the scheduled request when unmounted', async () => {
    vi.useFakeTimers();
    const request = vi.fn(() => Promise.resolve('data'));
    const { unmount } = renderHook(() => useRefreshData(request));

    unmount();
    await act(async () => vi.advanceTimersByTime(REQUEST_DELAY_MS * 2));

    expect(request).not.toHaveBeenCalled();
  });

  it('ignores an in-flight response after unmount', async () => {
    vi.useFakeTimers();
    const pending = deferred<string>();
    let signal: AbortSignal | undefined;
    const request = vi.fn((currentSignal: AbortSignal) => {
      signal = currentSignal;
      return pending.promise;
    });
    const { unmount } = renderHook(() => useRefreshData(request));

    await act(async () => vi.advanceTimersByTime(REQUEST_DELAY_MS));
    expect(request).toHaveBeenCalledOnce();
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve('late'));
    expect(request).toHaveBeenCalledOnce();
  });

  it('completes the request under StrictMode effect replay', async () => {
    const request = vi.fn(() => Promise.resolve('fresh'));
    const { result } = renderHook(() => useRefreshData(request), { wrapper: StrictMode });

    await waitFor(() => expect(result.current.data).toBe('fresh'));
    expect(result.current.ready).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('aborts obsolete parameters and ignores a late response', async () => {
    const first = deferred<string>();
    const signals: AbortSignal[] = [];
    const request = vi.fn((id: number, signal: AbortSignal) => {
      signals.push(signal);
      return id === 1 ? first.promise : Promise.resolve('current');
    });
    const { result, rerender } = renderHook(({ id }) => useRefreshData((signal) => request(id, signal), [id]), {
      initialProps: { id: 1 },
    });

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    rerender({ id: 2 });
    expect(signals[0].aborted).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('current'));

    await act(async () => first.resolve('stale'));
    expect(result.current.data).toBe('current');
  });

  it('returns request failures to callers', async () => {
    const failure = new Error('request failed');
    const request = vi.fn(() => Promise.reject(failure));
    const { result } = renderHook(() => useRefreshData(request));

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.ready).toBe(false);
  });
});
