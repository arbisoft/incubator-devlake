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

import type { ScopeRow } from './types';
import { useScopeSelection } from './use-scope-selection';

const row = (id: ID): ScopeRow => ({ id, name: `scope-${id}`, projects: [] });

const setup = (rows: ScopeRow[]) =>
  renderHook((props: { rows: ScopeRow[]; ready: boolean }) => useScopeSelection(props.rows, props.ready), {
    initialProps: { rows, ready: true },
  });

describe('useScopeSelection', () => {
  it('starts empty and holds what the table selects', () => {
    const { result } = setup([row('1'), row('2')]);
    expect(result.current.selectedIds).toEqual([]);
    act(() => result.current.onChange(['2']));
    expect(result.current.selectedIds).toEqual(['2']);
  });

  it('keeps the selection while the next page is loading', () => {
    const { result, rerender } = setup([row('1'), row('2')]);
    act(() => result.current.onChange(['1']));
    rerender({ rows: [], ready: false });
    expect(result.current.selectedIds).toEqual(['1']);
  });

  it('drops ids that are not on the page that finished loading', () => {
    const { result, rerender } = setup([row('1'), row('2')]);
    act(() => result.current.onChange(['1', '2']));
    rerender({ rows: [row('2'), row('3')], ready: true });
    expect(result.current.selectedIds).toEqual(['2']);
  });

  it('clears on request', () => {
    const { result } = setup([row('1')]);
    act(() => result.current.onChange(['1']));
    act(() => result.current.clear());
    expect(result.current.selectedIds).toEqual([]);
  });
});
