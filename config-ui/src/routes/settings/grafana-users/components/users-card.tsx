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

import { useMemo } from 'react';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import {
  DataTable,
  EMPTY_ILLUSTRATION,
  ListToolbar,
  SectionCard,
  buildListEmpty,
  useListState,
  useRefreshVersion,
} from '@/ui';

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../constants';
import { getGrafanaUserColumns } from '../columns';
import { COPY } from '../constants';
import { toGrafanaListParams } from '../utils';

import { OrphansNotice } from './orphans-notice';

export const GrafanaUsersCard = () => {
  const list = useListState<string, Record<string, string>>({
    pageSize: DEFAULT_PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    filters: {},
  });
  const { version, refresh } = useRefreshVersion();
  const users = useRefreshData(
    (signal) => API.grafanaUsers.listUsers(toGrafanaListParams(list.query), signal),
    [version, list.query],
  );
  const columns = useMemo(() => getGrafanaUserColumns(), []);
  const orphanCount = users.data?.orphans.length ?? 0;

  const empty = buildListEmpty({
    failed: users.error !== undefined,
    onRetry: refresh,
    filtered: list.keyword !== '',
    empty: { ...COPY.empty, illustration: EMPTY_ILLUSTRATION.NO_USERS },
    noResults: COPY.noResults,
  });

  return (
    <SectionCard
      title={COPY.title}
      count={users.data?.count}
      actions={<ListToolbar list={list} searchPlaceholder={COPY.searchPlaceholder} />}
    >
      {orphanCount > 0 && <OrphansNotice count={orphanCount} />}
      <DataTable
        rowKey="id"
        ariaLabel={COPY.tableLabel}
        loading={!users.ready && users.error === undefined}
        columns={columns}
        dataSource={users.data?.users ?? []}
        empty={empty}
        list={list}
        total={users.data?.count ?? 0}
      />
    </SectionCard>
  );
};
