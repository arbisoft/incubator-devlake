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

import { useModalForm } from './use-modal-form';

vi.mock('antd', async (importOriginal) =>
  (await import('../__tests__/antd-message-mock')).loadMockedMessage(importOriginal),
);

const INITIAL = { name: '', mode: 'normal' };
const onClose = vi.fn();
const REASON = 'Enter a name.';
const OPTIONS = { onClose, required: ['name' as const], disabledReason: REASON };

describe('useModalForm', () => {
  beforeEach(() => onClose.mockClear());

  it('starts from the initial values and not saving', () => {
    const { result } = renderHook(() => useModalForm(INITIAL, OPTIONS));
    expect(result.current.values).toEqual(INITIAL);
    expect(result.current.modalProps.loading).toBe(false);
  });

  it('sets one field and keeps the others', () => {
    const { result } = renderHook(() => useModalForm(INITIAL, OPTIONS));
    act(() => result.current.setField('name', 'alpha'));
    expect(result.current.values).toEqual({ name: 'alpha', mode: 'normal' });
  });

  it('resets to the initial values', () => {
    const { result } = renderHook(() => useModalForm(INITIAL, OPTIONS));
    act(() => result.current.setField('mode', 'advanced'));
    act(() => result.current.reset());
    expect(result.current.values).toEqual(INITIAL);
  });

  it('resets and then reports the close on cancel', () => {
    const { result } = renderHook(() => useModalForm(INITIAL, OPTIONS));
    act(() => result.current.setField('name', 'alpha'));
    act(() => result.current.modalProps.onCancel());
    expect(result.current.values).toEqual(INITIAL);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('tracks the saving flag', () => {
    const { result } = renderHook(() => useModalForm(INITIAL, OPTIONS));
    act(() => result.current.setSaving(true));
    expect(result.current.modalProps.loading).toBe(true);
  });

  it('disables the submit with its reason until every required field has a value', () => {
    const { result } = renderHook(() => useModalForm(INITIAL, OPTIONS));
    expect(result.current.modalProps).toMatchObject({ submitDisabled: true, disabledReason: REASON });
    act(() => result.current.setField('name', 'alpha'));
    expect(result.current.modalProps.submitDisabled).toBe(false);
  });

  describe('submit', () => {
    const onSettled = vi.fn();
    const setup = () => renderHook(() => useModalForm(INITIAL, { ...OPTIONS, onSettled }));

    beforeEach(() => {
      onSettled.mockClear();
      vi.mocked(message.error).mockClear();
    });

    it('settles, runs onSuccess before the reset and close, then resets and closes', async () => {
      const { result } = setup();
      act(() => result.current.setField('name', 'alpha'));
      const order: string[] = [];
      onClose.mockImplementationOnce(() => order.push('close'));
      const onSuccess = vi.fn((value: string) => order.push(`success:${value}:${result.current.values.name}`));
      let outcome: [boolean, unknown] = [false, undefined];
      await act(async () => {
        outcome = await result.current.submit(() => Promise.resolve('done'), { onSuccess });
      });
      expect(outcome).toEqual([true, 'done']);
      expect(order).toEqual(['success:done:alpha', 'close']);
      expect(onSettled).toHaveBeenCalledOnce();
      expect(result.current.values).toEqual(INITIAL);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('settles, keeps the values and stays open when the request fails', async () => {
      const { result } = setup();
      act(() => result.current.setField('name', 'alpha'));
      const failure = new Error('boom');
      const onSuccess = vi.fn();
      let outcome: [boolean, unknown] = [true, undefined];
      await act(async () => {
        outcome = await result.current.submit(() => Promise.reject(failure), { onSuccess, hideToast: true });
      });
      expect(outcome).toEqual([false, failure]);
      expect(onSettled).toHaveBeenCalledOnce();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(result.current.values.name).toBe('alpha');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('turns saving on while the request runs and off after it settles', async () => {
      const { result } = setup();
      let finish: (() => void) | undefined;
      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = result.current.submit(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
          { hideToast: true },
        );
      });
      expect(result.current.modalProps.loading).toBe(true);
      await act(async () => {
        finish?.();
        await pending;
      });
      expect(result.current.modalProps.loading).toBe(false);
    });
  });
});
