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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LAYOUT } from '@/theme/scales';
import { STORAGE_KEYS } from '@/ui/constants';

import { useSidebarCollapsed } from './use-sidebar-collapsed';

const setWidth = (width: number) => Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });

describe('useSidebarCollapsed', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('defaults to expanded on wide screens and to the rail below the tablet breakpoint', () => {
    setWidth(LAYOUT.breakpointTablet);
    expect(renderHook(() => useSidebarCollapsed()).result.current[0]).toBe(false);
    setWidth(LAYOUT.breakpointTablet - 1);
    expect(renderHook(() => useSidebarCollapsed()).result.current[0]).toBe(true);
  });

  it('persists the choice and prefers it over the viewport default', () => {
    setWidth(LAYOUT.breakpointTablet - 1);
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current[1](false));
    expect(window.localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED)).toBe('false');
    expect(renderHook(() => useSidebarCollapsed()).result.current[0]).toBe(false);
  });

  it('still works when storage throws', () => {
    setWidth(LAYOUT.breakpointTablet);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});
