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

import { SearchOutlined } from '@ant-design/icons';
import { useDebounce } from 'ahooks';
import { Input } from 'antd';
import { uniqBy } from 'lodash';
import type { McsItem } from 'miller-columns-select';
import { useState, useEffect, useEffectEvent, useMemo } from 'react';

import API from '@/api';
import { Block } from '@/components';
import { getPluginScopeName } from '@/plugins/utils';

import { COPY, ROOT_COLUMN_ID, SCOPE_ITEM_TYPE, SEARCH_DEBOUNCE_MS, SEARCH_PAGE_SIZE } from './constants';
import { loadChildren } from './load-children';
import { ScopePanes } from './scope-panes';
import { SelectedScopes } from './selected-scopes';
import { Stack } from './styled';
import type { ResItem, SearchProps } from './types';
import { toBrowseProps, toSelectionProps } from './utils';

type MillerState = {
  items: McsItem<ResItem>[];
  loadedIds: ID[];
  errorId?: ID | null;
  nextTokenMap: Record<ID, string>;
};

type SearchState = {
  loading: boolean;
  items: McsItem<ResItem>[];
  currentItems: McsItem<ResItem>[];
  query: string;
  page: number;
  total: number;
  hasMore: boolean;
};

export const SearchRemote = ({
  mode,
  plugin,
  connectionId,
  config,
  disabledScope,
  selectedScope,
  onChange,
}: SearchProps) => {
  const [miller, setMiller] = useState<MillerState>({ items: [], loadedIds: [], nextTokenMap: {} });
  const [search, setSearch] = useState<SearchState>({
    loading: true,
    items: [],
    currentItems: [],
    query: '',
    page: 1,
    total: 0,
    hasMore: false,
  });

  const searchDebounce = useDebounce(search.query, { wait: SEARCH_DEBOUNCE_MS });

  const allItems = useMemo(
    () =>
      uniqBy(
        [...miller.items, ...search.items].filter((it) => it.type === SCOPE_ITEM_TYPE.SCOPE),
        'id',
      ),
    [miller.items, search.items],
  );

  const getItems = async (groupId: ID | null, currentPageToken?: string) => {
    const {
      items: newItems,
      nextPageToken,
      failed,
    } = await loadChildren({
      plugin,
      connectionId,
      groupId,
      pageToken: currentPageToken,
      toTitle: (it) => getPluginScopeName(plugin, it) || it.name,
    });
    const errorId = failed ? groupId : undefined;

    if (nextPageToken && newItems.length) {
      setMiller((m) => ({
        ...m,
        items: [...m.items, ...newItems],
        nextTokenMap: {
          ...m.nextTokenMap,
          [groupId ?? ROOT_COLUMN_ID]: nextPageToken,
        },
      }));
    } else {
      setMiller((m) => ({
        ...m,
        items: [...m.items, ...newItems],
        loadedIds: [...m.loadedIds, groupId ?? ROOT_COLUMN_ID],
        errorId,
      }));
    }
  };

  const loadRoot = useEffectEvent(() => getItems(null));

  useEffect(() => {
    loadRoot();
  }, []);

  const runSearch = useEffectEvent(async (term: string, page: number, isStale: () => boolean) => {
    try {
      const res = await API.scope.searchRemote(plugin, connectionId, {
        search: term,
        page,
        pageSize: SEARCH_PAGE_SIZE,
      });
      if (isStale()) return;

      const newItems = (res?.children ?? []).map((it) => ({
        ...it,
        title: getPluginScopeName(plugin, it) || it.fullName || it.name,
      }));

      const total = res.count ?? 0;
      const hasMore = total > 0 ? page * SEARCH_PAGE_SIZE < total : newItems.length >= SEARCH_PAGE_SIZE;

      setSearch((s) => ({
        ...s,
        loading: false,
        items: [...allItems, ...newItems],
        currentItems: s.page === 1 ? newItems : [...s.currentItems, ...newItems],
        total,
        hasMore,
      }));
    } catch {
      if (!isStale()) setSearch((s) => ({ ...s, loading: false, hasMore: false }));
    }
  });

  useEffect(() => {
    if (!searchDebounce) return undefined;
    let stale = false;
    runSearch(searchDebounce, search.page, () => stale);

    return () => {
      stale = true;
    };
  }, [searchDebounce, search.page]);

  const searchPlaceholder = config.searchPlaceholder ?? COPY.searchFallback;
  const browseProps = toBrowseProps(miller, config);
  const selectionProps = toSelectionProps(disabledScope, selectedScope, allItems, onChange);

  return (
    <Block title={config.title} required>
      <Stack>
        <Input
          prefix={<SearchOutlined />}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={search.query}
          onChange={(e) =>
            setSearch({ ...search, query: e.target.value, loading: true, currentItems: [], page: 1, hasMore: false })
          }
        />
        {!searchDebounce ? (
          <ScopePanes<ResItem>
            mode={mode}
            items={miller.items}
            {...browseProps}
            {...selectionProps}
            onExpand={(id) => getItems(id, miller.nextTokenMap[id])}
            onScroll={(id) => getItems(id, miller.nextTokenMap[id ?? ROOT_COLUMN_ID])}
          />
        ) : (
          <ScopePanes<ResItem>
            mode={mode}
            items={search.currentItems}
            columnCount={1}
            getCanExpand={() => false}
            getHasMore={() => search.hasMore}
            onScroll={() => {
              if (!search.loading && search.hasMore) {
                setSearch((s) => ({ ...s, loading: true, page: s.page + 1 }));
              }
            }}
            {...selectionProps}
          />
        )}
        <SelectedScopes plugin={plugin} scopes={selectedScope} onChange={onChange} />
      </Stack>
    </Block>
  );
};
