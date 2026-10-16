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

import { useRefreshVersion } from './use-refresh-version';

describe('useRefreshVersion', () => {
  it('starts at zero and counts each refresh', () => {
    const { result } = renderHook(() => useRefreshVersion());
    expect(result.current.version).toBe(0);
    act(() => result.current.refresh());
    act(() => result.current.refresh());
    expect(result.current.version).toBe(2);
  });

  it('keeps the same refresh function across renders', () => {
    const { result, rerender } = renderHook(() => useRefreshVersion());
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });
});
