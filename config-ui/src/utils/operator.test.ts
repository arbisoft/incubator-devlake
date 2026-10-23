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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { messageMock } from '@/ui/__tests__/mock-message';

import { operator } from './operator';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

const failure = Object.assign(new Error('boom'), { response: { data: { message: 'server says no' } } });

describe('operator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the default success toast and returns the response', async () => {
    const result = await operator(() => Promise.resolve({ id: 1 }));

    expect(result).toEqual([true, { id: 1 }]);
    expect(messageMock.success).toHaveBeenCalledWith('Operation successfully completed');
    expect(messageMock.error).not.toHaveBeenCalled();
  });

  it('shows the server message on failure, returns the error, and does not log to the console', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await operator(() => Promise.reject(failure));

    expect(result).toEqual([false, failure]);
    expect(messageMock.error).toHaveBeenCalledWith('server says no');
    expect(messageMock.success).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('returns the rejection and the default toast when the request rejects with null', async () => {
    const result = await operator(() => Promise.reject(null));

    expect(result).toEqual([false, null]);
    expect(messageMock.error).toHaveBeenCalledWith('Operation failed.');
  });

  it('shows no toast when hideToast is set', async () => {
    await operator(() => Promise.resolve(1), { hideToast: true });
    await operator(() => Promise.reject(failure), { hideToast: true });

    expect(messageMock.success).not.toHaveBeenCalled();
    expect(messageMock.error).not.toHaveBeenCalled();
  });

  it('reports the operating state as true and then false', async () => {
    const setOperating = vi.fn();

    await operator(() => Promise.reject(failure), { setOperating, hideToast: true });

    expect(setOperating.mock.calls).toEqual([[true], [false]]);
  });
});
