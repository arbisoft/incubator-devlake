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

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLastLoaded } from './use-last-loaded';

type Props = { value: string | undefined; scope: string };

const setup = (initial: Props) =>
  renderHook(({ value, scope }: Props) => useLastLoaded(value, scope), { initialProps: initial });

describe('useLastLoaded', () => {
  it('returns the value while it is loaded', () => {
    const { result } = setup({ value: 'a', scope: 'one' });
    expect(result.current).toBe('a');
  });

  it('keeps the last value while a refetch of the same scope is pending', () => {
    const { result, rerender } = setup({ value: 'a', scope: 'one' });
    rerender({ value: undefined, scope: 'one' });
    expect(result.current).toBe('a');
  });

  it('replaces the kept value when a newer one arrives', () => {
    const { result, rerender } = setup({ value: 'a', scope: 'one' });
    rerender({ value: 'b', scope: 'one' });
    rerender({ value: undefined, scope: 'one' });
    expect(result.current).toBe('b');
  });

  it('drops the kept value when the scope changes', () => {
    const { result, rerender } = setup({ value: 'a', scope: 'one' });
    rerender({ value: undefined, scope: 'two' });
    expect(result.current).toBeUndefined();
  });

  it('is empty before anything loaded', () => {
    const { result } = setup({ value: undefined, scope: 'one' });
    expect(result.current).toBeUndefined();
  });
});
