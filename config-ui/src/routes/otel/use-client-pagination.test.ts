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

import { DEFAULT_OTEL_PAGE_SIZE, OTEL_PAGE_SIZE_OPTIONS } from './constants';
import { useClientPagination } from './use-client-pagination';

const makeItems = (count: number) => Array.from({ length: count }, (_, index) => index);

describe('useClientPagination', () => {
  it('slices the first page with the default size and reports the total', () => {
    const { result } = renderHook(() => useClientPagination(makeItems(25)));

    expect(result.current.rows).toEqual(makeItems(DEFAULT_OTEL_PAGE_SIZE));
    expect(result.current.pagination).toMatchObject({
      page: 1,
      pageSize: DEFAULT_OTEL_PAGE_SIZE,
      total: 25,
      pageSizeOptions: OTEL_PAGE_SIZE_OPTIONS,
    });
  });

  it('moves to the requested page', () => {
    const { result } = renderHook(() => useClientPagination(makeItems(25)));

    act(() => result.current.pagination.onPageChange(3));

    expect(result.current.rows).toEqual([20, 21, 22, 23, 24]);
  });

  it('keeps the page when the rows refresh with the same length', () => {
    const { result, rerender } = renderHook(({ items }) => useClientPagination(items), {
      initialProps: { items: makeItems(25) },
    });
    act(() => result.current.pagination.onPageChange(2));

    rerender({ items: makeItems(25) });

    expect(result.current.pagination.page).toBe(2);
    expect(result.current.rows).toEqual(makeItems(25).slice(10, 20));
  });

  it('clamps to the last page when the rows shrink', () => {
    const { result, rerender } = renderHook(({ items }) => useClientPagination(items), {
      initialProps: { items: makeItems(21) },
    });
    act(() => result.current.pagination.onPageChange(3));

    rerender({ items: makeItems(20) });

    expect(result.current.pagination.page).toBe(2);
    expect(result.current.rows).toEqual(makeItems(20).slice(10, 20));
  });

  it('shows page 1 for an empty list', () => {
    const { result, rerender } = renderHook(({ items }) => useClientPagination(items), {
      initialProps: { items: makeItems(15) },
    });
    act(() => result.current.pagination.onPageChange(2));

    rerender({ items: [] });

    expect(result.current.pagination.page).toBe(1);
    expect(result.current.rows).toEqual([]);
  });

  it('goes back to page 1 when the page size changes', () => {
    const { result } = renderHook(() => useClientPagination(makeItems(60)));
    act(() => result.current.pagination.onPageChange(3));

    act(() => result.current.pagination.onPageSizeChange(50));

    expect(result.current.pagination.page).toBe(1);
    expect(result.current.pagination.pageSize).toBe(50);
    expect(result.current.rows).toHaveLength(50);
  });
});
