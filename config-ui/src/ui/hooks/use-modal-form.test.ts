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

import { useModalForm } from './use-modal-form';

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
});
