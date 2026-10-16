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

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REQUEST_DELAY_MS } from '@/hooks/use-refresh-data/constants';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { get, mocks, resetConnectionFormMocks, test } from './__tests__/connection-form.test-utils';
import { COPY } from './constants';

const { ConnectionForm } = await import('./connection-form');

describe('ConnectionForm saved details', () => {
  beforeEach(() => {
    resetConnectionFormMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks test and save when saved details fail to load, then restores them after retry', async () => {
    get.mockRejectedValueOnce(new Error('passive load failed')).mockResolvedValueOnce({
      id: 7,
      endpoint: 'loaded-endpoint',
      name: mocks.savedName,
      proxy: '',
    });
    test.mockResolvedValue({ success: true, message: mocks.successMessage });
    renderWithTheme(<ConnectionForm plugin="gitlab" connectionId={7} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });

    expect(
      screen.getByText('Saved connection details could not be loaded. Retry before saving or testing.'),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: COPY.save.label }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: COPY.test.label }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: COPY.save.label }));
    fireEvent.click(screen.getByRole('button', { name: COPY.test.label }));
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(test).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });

    expect(screen.getByTestId('endpoint-value').textContent).toBe('loaded-endpoint');
    expect((screen.getByRole('button', { name: COPY.save.label }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: COPY.test.label }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: COPY.test.label }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(test).toHaveBeenCalledOnce();
  });

  it('aborts an old connection request and ignores its late response', async () => {
    let resolveOld: ((value: { id: ID; endpoint: string; name: string; proxy: string }) => void) | undefined;
    const oldRequest = new Promise<{ id: ID; endpoint: string; name: string; proxy: string }>((resolve) => {
      resolveOld = resolve;
    });
    get.mockReturnValueOnce(oldRequest).mockResolvedValueOnce({
      id: 8,
      endpoint: 'current-endpoint',
      name: 'Current connection',
      proxy: '',
    });
    const { rerender } = renderWithTheme(<ConnectionForm plugin="gitlab" connectionId={7} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });
    rerender(<ConnectionForm plugin="gitlab" connectionId={8} />);
    const [[, , oldSignal]] = get.mock.calls;
    expect(oldSignal?.aborted).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });
    await act(async () => {
      resolveOld?.({ id: 7, endpoint: 'obsolete-endpoint', name: 'Old connection', proxy: '' });
      await oldRequest;
    });

    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('endpoint-value').textContent).toBe('current-endpoint');
  });
});
