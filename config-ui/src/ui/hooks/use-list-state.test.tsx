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
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, LIST_PARAMS, SORT_ORDER } from '@/ui/constants';

import { useListState } from './use-list-state';

type SortField = 'name' | 'status';

const DEFAULTS = {
  sort: { sortBy: 'name' as SortField, sortOrder: SORT_ORDER.ASC },
  filters: { status: 'all' },
};

const setup = (initial = '/list') => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
  return renderHook(() => ({ list: useListState<SortField, { status: string }>(DEFAULTS), location: useLocation() }), {
    wrapper,
  });
};

describe('useListState', () => {
  it('returns defaults for an empty URL', () => {
    const { result } = setup();
    expect(result.current.list).toMatchObject({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
      keyword: '',
      sort: DEFAULTS.sort,
      filters: DEFAULTS.filters,
    });
    expect(result.current.location.search).toBe('');
  });

  it('reads the LIST_PARAMS names from the URL', () => {
    const { result } = setup(
      `/list?${LIST_PARAMS.PAGE}=3&${LIST_PARAMS.PAGE_SIZE}=50&${LIST_PARAMS.KEYWORD}=jira&${LIST_PARAMS.SORT_BY}=status&${LIST_PARAMS.SORT_ORDER}=desc&status=failed`,
    );
    expect(result.current.list).toMatchObject({
      page: 3,
      pageSize: 50,
      keyword: 'jira',
      sort: { sortBy: 'status', sortOrder: SORT_ORDER.DESC },
      filters: { status: 'failed' },
    });
  });

  it('defaults the sort order to desc when sortBy has none or an invalid one', () => {
    expect(setup(`/list?${LIST_PARAMS.SORT_BY}=status`).result.current.list.sort).toEqual({
      sortBy: 'status',
      sortOrder: SORT_ORDER.DESC,
    });
    expect(
      setup(`/list?${LIST_PARAMS.SORT_BY}=status&${LIST_PARAMS.SORT_ORDER}=sideways`).result.current.list.sort,
    ).toEqual({ sortBy: 'status', sortOrder: SORT_ORDER.DESC });
  });

  it('keeps an ascending sort on another column in the URL', () => {
    const { result } = setup();
    act(() => result.current.list.setSort({ sortBy: 'status', sortOrder: SORT_ORDER.ASC }));
    expect(result.current.list.sort).toEqual({ sortBy: 'status', sortOrder: SORT_ORDER.ASC });
  });

  it('is safe with an inline defaults literal: setters keep their identity across re-renders', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
    const { result, rerender } = renderHook(
      () => useListState<SortField, { status: string }>({ filters: { status: 'all' } }),
      { wrapper },
    );
    const first = result.current;
    rerender();
    expect(result.current.setKeyword).toBe(first.setKeyword);
    expect(result.current.setFilter).toBe(first.setFilter);
    expect(result.current.toQuery).toBe(first.toQuery);
  });

  it('ignores invalid page and page size values', () => {
    const { result } = setup(`/list?${LIST_PARAMS.PAGE}=-2&${LIST_PARAMS.PAGE_SIZE}=7`);
    expect(result.current.list.page).toBe(DEFAULT_PAGE);
    expect(result.current.list.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('resets the page to 1 when the keyword changes', () => {
    const { result } = setup(`/list?${LIST_PARAMS.PAGE}=4`);
    act(() => result.current.list.setKeyword('git'));
    expect(result.current.list.keyword).toBe('git');
    expect(result.current.list.page).toBe(1);
    expect(result.current.location.search).toBe(`?${LIST_PARAMS.KEYWORD}=git`);
  });

  it('resets the page to 1 when a filter changes', () => {
    const { result } = setup(`/list?${LIST_PARAMS.PAGE}=4`);
    act(() => result.current.list.setFilter('status', 'failed'));
    expect(result.current.list.filters.status).toBe('failed');
    expect(result.current.list.page).toBe(1);
  });

  it('keeps the page when only the sort changes and drops default values from the URL', () => {
    const { result } = setup(`/list?${LIST_PARAMS.PAGE}=2`);
    act(() => result.current.list.setSort({ sortBy: 'status', sortOrder: SORT_ORDER.DESC }));
    expect(result.current.list.page).toBe(2);
    expect(result.current.list.sort).toEqual({ sortBy: 'status', sortOrder: SORT_ORDER.DESC });
    act(() => result.current.list.setSort(DEFAULTS.sort));
    expect(result.current.location.search).toBe(`?${LIST_PARAMS.PAGE}=2`);
  });

  it('sets the page size and goes back to the first page', () => {
    const { result } = setup(`/list?${LIST_PARAMS.PAGE}=5`);
    act(() => result.current.list.setPageSize(50));
    expect(result.current.list).toMatchObject({ page: 1, pageSize: 50 });
  });

  it('builds the query for the API without empty values', () => {
    const { result } = setup(`/list?${LIST_PARAMS.KEYWORD}=a&${LIST_PARAMS.PAGE}=2`);
    expect(result.current.list.toQuery()).toEqual({
      [LIST_PARAMS.PAGE]: 2,
      [LIST_PARAMS.PAGE_SIZE]: DEFAULT_PAGE_SIZE,
      [LIST_PARAMS.KEYWORD]: 'a',
      [LIST_PARAMS.SORT_BY]: 'name',
      [LIST_PARAMS.SORT_ORDER]: SORT_ORDER.ASC,
      status: 'all',
    });
  });

  it('resets everything to the defaults and keeps unrelated params', () => {
    const { result } = setup(`/list?tab=a&${LIST_PARAMS.PAGE}=2&${LIST_PARAMS.KEYWORD}=x&status=failed`);
    act(() => result.current.list.reset());
    expect(result.current.list).toMatchObject({ page: 1, keyword: '', filters: { status: 'all' } });
    expect(result.current.location.search).toBe('?tab=a');
  });

  it('exposes the typed API query, omitting an empty keyword', () => {
    const { result } = setup(`/list?${LIST_PARAMS.PAGE}=2&${LIST_PARAMS.PAGE_SIZE}=50`);
    expect(result.current.list.query).toEqual({
      page: 2,
      pageSize: 50,
      keyword: undefined,
      sortBy: 'name',
      sortOrder: SORT_ORDER.ASC,
    });
  });

  it('keeps the query identity until a list value changes', () => {
    const { result, rerender } = setup();
    const first = result.current.list.query;
    rerender();
    expect(result.current.list.query).toBe(first);
    act(() => result.current.list.setKeyword('jira'));
    expect(result.current.list.query).not.toBe(first);
    expect(result.current.list.query.keyword).toBe('jira');
  });
});
