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
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { IConnectionStatus, type IConnection } from '@/types';

import { HEALTH_CONCURRENCY, HEALTH_PROBE_TIMEOUT_MS, HEALTH_TTL_MS } from './constants';
import { connectionsSlice } from './slice';
import { useHealthChecks } from './use-health-checks';

vi.mock('@/api', () => ({ default: { connection: { test: vi.fn() } } }));

const NOW = 1_700_000_000_000;
const MINUTE_MS = 60_000;

const testMock = vi.mocked(API.connection.test);
const connection = (id: number) => ({ unique: `github-${id}`, plugin: 'github', id }) as IConnection;

const setup = (health = {}) => {
  const store = configureStore({
    reducer: { connections: connectionsSlice.reducer },
    preloadedState: { connections: { ...connectionsSlice.getInitialState(), health } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useHealthChecks(), { wrapper });
  return { store, check: result.current.check };
};

describe('useHealthChecks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    testMock.mockResolvedValue({ success: true, message: '' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('tests the connections that have no valid result and records the outcome', async () => {
    const { store, check } = setup();
    check([connection(1)]);
    await waitFor(() => expect(store.getState().connections.health['github-1']?.status).toBe(IConnectionStatus.ONLINE));
    expect(testMock).toHaveBeenCalledWith('github', 1, undefined, HEALTH_PROBE_TIMEOUT_MS);
  });

  it('skips connections with a result inside the window', async () => {
    const fresh = { 'github-1': { status: IConnectionStatus.ONLINE, testedAt: NOW - MINUTE_MS } };
    const { check } = setup(fresh);
    check([connection(1)]);
    await Promise.resolve();
    expect(testMock).not.toHaveBeenCalled();
  });

  it('tests again once the window has passed', async () => {
    const old = { 'github-1': { status: IConnectionStatus.ONLINE, testedAt: NOW - HEALTH_TTL_MS - 1 } };
    const { store, check } = setup(old);
    check([connection(1)]);
    await waitFor(() => expect(store.getState().connections.health['github-1']?.testedAt).toBe(NOW));
  });

  it('tests the same connection once however often it is asked', async () => {
    const { store, check } = setup();
    check([connection(1)]);
    check([connection(1)]);
    check([connection(1)]);
    await waitFor(() => expect(store.getState().connections.health['github-1']).toBeDefined());
    expect(testMock).toHaveBeenCalledTimes(1);
  });

  it('does not test a connection that another check is already testing', async () => {
    let finish: () => void = () => undefined;
    testMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ success: true, message: '' });
        }),
    );
    const store = configureStore({
      reducer: { connections: connectionsSlice.reducer },
      preloadedState: { connections: connectionsSlice.getInitialState() },
    });
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const first = renderHook(() => useHealthChecks(), { wrapper });
    const second = renderHook(() => useHealthChecks(), { wrapper });
    first.result.current.check([connection(1)]);
    await waitFor(() => expect(testMock).toHaveBeenCalledTimes(1));
    second.result.current.check([connection(1)]);
    await Promise.resolve();
    finish();
    await waitFor(() => expect(store.getState().connections.health['github-1']).toBeDefined());
    expect(testMock).toHaveBeenCalledTimes(1);
  });

  it('runs at most the limit at once', async () => {
    let inFlight = 0;
    let peak = 0;
    testMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { success: true, message: '' };
    });
    const { store, check } = setup();
    check([1, 2, 3, 4, 5, 6].map(connection));
    await waitFor(() => expect(Object.keys(store.getState().connections.health)).toHaveLength(6));
    expect(peak).toBeLessThanOrEqual(HEALTH_CONCURRENCY);
  });

  it('records a failed probe silently', async () => {
    testMock.mockRejectedValue({ message: 'Network Error' });
    const { store, check } = setup();
    check([connection(1)]);
    await waitFor(() =>
      expect(store.getState().connections.health['github-1']?.status).toBe(IConnectionStatus.OFFLINE),
    );
  });
});
