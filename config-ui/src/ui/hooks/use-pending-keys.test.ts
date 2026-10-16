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
import { describe, expect, it } from 'vitest';

import { usePendingKeys } from './use-pending-keys';

const KEY = 'user:7';
const OTHER_KEY = 'domain:7';

describe('usePendingKeys', () => {
  it('lets only the first of two same-tick acquisitions through and reports the key as pending', () => {
    const { result } = renderHook(() => usePendingKeys());
    const { begin } = result.current;
    let acquired: boolean[] = [];
    act(() => {
      acquired = [begin(KEY), begin(KEY)];
    });
    expect(acquired).toEqual([true, false]);
    expect(result.current.isPending(KEY)).toBe(true);
  });

  it('allows a new change for the key once it is released', () => {
    const { result } = renderHook(() => usePendingKeys());
    act(() => {
      result.current.begin(KEY);
    });
    act(() => result.current.end(KEY));
    expect(result.current.isPending(KEY)).toBe(false);
    let again = false;
    act(() => {
      again = result.current.begin(KEY);
    });
    expect(again).toBe(true);
    expect(result.current.isPending(KEY)).toBe(true);
  });

  it('keeps different keys independent', () => {
    const { result } = renderHook(() => usePendingKeys());
    let both: boolean[] = [];
    act(() => {
      both = [result.current.begin(KEY), result.current.begin(OTHER_KEY)];
    });
    expect(both).toEqual([true, true]);
    act(() => result.current.end(KEY));
    expect(result.current.isPending(KEY)).toBe(false);
    expect(result.current.isPending(OTHER_KEY)).toBe(true);
  });

  it('reports nothing pending before any change and ignores releasing an unknown key', () => {
    const { result } = renderHook(() => usePendingKeys());
    expect(result.current.isPending(KEY)).toBe(false);
    act(() => result.current.end(KEY));
    expect(result.current.isPending(KEY)).toBe(false);
  });
});
