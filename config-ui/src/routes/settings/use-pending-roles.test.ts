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

import { usePendingRoles } from './use-pending-roles';

const KEY = 'user:7';
const OTHER_KEY = 'domain:7';

describe('usePendingRoles', () => {
  it('lets only the first of two same-tick acquisitions through and reports the key as pending', () => {
    const { result } = renderHook(() => usePendingRoles());
    const { beginRoleChange } = result.current;
    let acquired: boolean[] = [];
    act(() => {
      acquired = [beginRoleChange(KEY), beginRoleChange(KEY)];
    });
    expect(acquired).toEqual([true, false]);
    expect(result.current.isRolePending(KEY)).toBe(true);
  });

  it('allows a new change for the key once it is released', () => {
    const { result } = renderHook(() => usePendingRoles());
    act(() => {
      result.current.beginRoleChange(KEY);
    });
    act(() => result.current.endRoleChange(KEY));
    expect(result.current.isRolePending(KEY)).toBe(false);
    let again = false;
    act(() => {
      again = result.current.beginRoleChange(KEY);
    });
    expect(again).toBe(true);
    expect(result.current.isRolePending(KEY)).toBe(true);
  });

  it('keeps different keys independent', () => {
    const { result } = renderHook(() => usePendingRoles());
    let both: boolean[] = [];
    act(() => {
      both = [result.current.beginRoleChange(KEY), result.current.beginRoleChange(OTHER_KEY)];
    });
    expect(both).toEqual([true, true]);
    act(() => result.current.endRoleChange(KEY));
    expect(result.current.isRolePending(KEY)).toBe(false);
    expect(result.current.isRolePending(OTHER_KEY)).toBe(true);
  });

  it('reports nothing pending before any change and ignores releasing an unknown key', () => {
    const { result } = renderHook(() => usePendingRoles());
    expect(result.current.isRolePending(KEY)).toBe(false);
    act(() => result.current.endRoleChange(KEY));
    expect(result.current.isRolePending(KEY)).toBe(false);
  });
});
