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

import { useCallback, useMemo, useState } from 'react';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import {
  DataTable,
  ListPage,
  ListToolbar,
  PageHeader,
  SectionCard,
  buildListEmpty,
  useListState,
  useRefreshVersion,
} from '@/ui';

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../constants';

import { getActivityColumns } from './columns';
import { ActivityDrawer } from './components';
import { COPY } from './constants';
import type { ActivityRow } from './types';
import { filterActivityRows, paginateRows, toActivityRow } from './utils';

export const SettingsActivity = () => {
  const list = useListState<string, Record<string, never>>({
    pageSize: DEFAULT_PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    filters: {},
  });
  const { keyword, page, pageSize } = list;
  const { version, refresh } = useRefreshVersion();
  const [selected, setSelected] = useState<ActivityRow>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, ready, error } = useRefreshData((signal) => API.access.listAuditEvents(signal), [version]);

  const rows = useMemo(() => (data ?? []).map(toActivityRow), [data]);
  const filtered = useMemo(() => filterActivityRows(rows, keyword), [rows, keyword]);
  const pageRows = useMemo(() => paginateRows(filtered, page, pageSize), [filtered, page, pageSize]);

  const openRow = useCallback((row: ActivityRow) => {
    setSelected(row);
    setDrawerOpen(true);
  }, []);
  const columns = useMemo(() => getActivityColumns(openRow), [openRow]);

  const empty = buildListEmpty({
    failed: error !== undefined,
    onRetry: refresh,
    filtered: keyword !== '',
    empty: COPY.empty,
    noResults: COPY.noResults,
  });

  return (
    <ListPage>
      <PageHeader title={COPY.title} description={COPY.description} />
      <ListToolbar list={list} searchPlaceholder={COPY.searchPlaceholder} />
      <SectionCard title={COPY.sectionTitle}>
        <DataTable
          rowKey="id"
          ariaLabel={COPY.tableLabel}
          loading={!ready && error === undefined}
          columns={columns}
          dataSource={pageRows}
          empty={empty}
          list={list}
          total={filtered.length}
        />
      </SectionCard>
      <ActivityDrawer open={drawerOpen} row={selected} onClose={() => setDrawerOpen(false)} />
    </ListPage>
  );
};
