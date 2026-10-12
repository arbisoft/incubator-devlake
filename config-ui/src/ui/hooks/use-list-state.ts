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

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, LIST_PARAMS, PAGE_SIZE_OPTIONS, SORT_ORDER } from '@/ui/constants';
import type { SortOrder, SortState } from '@/ui/types';

type ListSort<S extends string> = SortState<S>;
type ListFilters = Record<string, string>;

export type ListDefaults<S extends string, F extends ListFilters> = {
  pageSize?: number;
  keyword?: string;
  sort?: ListSort<S>;
  filters: F;
};

type ListValues<S extends string, F extends ListFilters> = {
  page: number;
  pageSize: number;
  keyword: string;
  sort?: ListSort<S>;
  filters: F;
};

const isSortOrder = (value: string | null): value is SortOrder => value === SORT_ORDER.ASC || value === SORT_ORDER.DESC;

const readList = <S extends string, F extends ListFilters>(
  params: URLSearchParams,
  defaults: ListDefaults<S, F>,
): ListValues<S, F> => {
  const page = Number(params.get(LIST_PARAMS.PAGE));
  const pageSize = Number(params.get(LIST_PARAMS.PAGE_SIZE));
  const sortBy = params.get(LIST_PARAMS.SORT_BY);
  const sortOrder = params.get(LIST_PARAMS.SORT_ORDER);
  const filters = Object.fromEntries(
    Object.entries(defaults.filters).map(([name, fallback]) => [name, params.get(name) ?? fallback]),
  ) as F;
  return {
    page: Number.isInteger(page) && page > 0 ? page : DEFAULT_PAGE,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
      ? pageSize
      : (defaults.pageSize ?? DEFAULT_PAGE_SIZE),
    keyword: params.get(LIST_PARAMS.KEYWORD) ?? defaults.keyword ?? '',
    sort: sortBy
      ? { sortBy: sortBy as S, sortOrder: isSortOrder(sortOrder) ? sortOrder : SORT_ORDER.DESC }
      : defaults.sort,
    filters,
  };
};

const writeList = <S extends string, F extends ListFilters>(
  params: URLSearchParams,
  values: ListValues<S, F>,
  defaults: ListDefaults<S, F>,
) => {
  const next = new URLSearchParams(params);
  const put = (name: string, value: string | number | undefined, fallback?: string | number) => {
    if (value === undefined || value === '' || value === fallback) next.delete(name);
    else next.set(name, String(value));
  };
  put(LIST_PARAMS.PAGE, values.page, DEFAULT_PAGE);
  put(LIST_PARAMS.PAGE_SIZE, values.pageSize, defaults.pageSize ?? DEFAULT_PAGE_SIZE);
  put(LIST_PARAMS.KEYWORD, values.keyword, defaults.keyword ?? '');
  const isDefaultSort =
    values.sort?.sortBy === defaults.sort?.sortBy && values.sort?.sortOrder === defaults.sort?.sortOrder;
  put(LIST_PARAMS.SORT_BY, values.sort?.sortBy, isDefaultSort ? values.sort?.sortBy : undefined);
  put(LIST_PARAMS.SORT_ORDER, values.sort?.sortOrder, isDefaultSort ? values.sort?.sortOrder : undefined);
  for (const [name, fallback] of Object.entries(defaults.filters)) put(name, values.filters[name], fallback);
  return next;
};

export const useListState = <S extends string, F extends ListFilters>(inlineDefaults: ListDefaults<S, F>) => {
  const [params, setParams] = useSearchParams();
  const serialized = JSON.stringify(inlineDefaults);
  const defaults = useMemo(() => JSON.parse(serialized) as ListDefaults<S, F>, [serialized]);
  const values = useMemo(() => readList(params, defaults), [params, defaults]);

  const update = useCallback(
    (patch: (current: ListValues<S, F>) => Partial<ListValues<S, F>>) =>
      setParams((prev) => {
        const current = readList(prev, defaults);
        return writeList(prev, { ...current, ...patch(current) }, defaults);
      }),
    [defaults, setParams],
  );

  const setPage = useCallback((page: number) => update(() => ({ page })), [update]);
  const setPageSize = useCallback((pageSize: number) => update(() => ({ pageSize, page: DEFAULT_PAGE })), [update]);
  const setKeyword = useCallback((keyword: string) => update(() => ({ keyword, page: DEFAULT_PAGE })), [update]);
  const setSort = useCallback((sort?: ListSort<S>) => update(() => ({ sort })), [update]);
  const setFilter = useCallback(
    <K extends keyof F>(name: K, value: F[K]) =>
      update((current) => ({ filters: { ...current.filters, [name]: value }, page: DEFAULT_PAGE })),
    [update],
  );
  const reset = useCallback(
    () =>
      setParams((prev) =>
        writeList(
          prev,
          {
            page: DEFAULT_PAGE,
            pageSize: defaults.pageSize ?? DEFAULT_PAGE_SIZE,
            keyword: defaults.keyword ?? '',
            sort: defaults.sort,
            filters: defaults.filters,
          },
          defaults,
        ),
      ),
    [defaults, setParams],
  );

  const toQuery = useCallback(() => {
    const { page, pageSize, keyword, sort, filters } = values;
    const entries: [string, string | number | undefined][] = [
      [LIST_PARAMS.PAGE, page],
      [LIST_PARAMS.PAGE_SIZE, pageSize],
      [LIST_PARAMS.KEYWORD, keyword],
      [LIST_PARAMS.SORT_BY, sort?.sortBy],
      [LIST_PARAMS.SORT_ORDER, sort?.sortOrder],
      ...Object.entries(filters),
    ];
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== '')) as Record<
      string,
      string | number
    >;
  }, [values]);

  return { ...values, setPage, setPageSize, setKeyword, setSort, setFilter, reset, toQuery };
};
