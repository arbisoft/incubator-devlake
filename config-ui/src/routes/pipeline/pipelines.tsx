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

import { useDebounce } from 'ahooks';
import { useMemo, useState } from 'react';

import API from '@/api';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { buildListEmpty, ListPage, PageHeader, SORT_ORDER, Toolbar, useListState, useRefreshVersion } from '@/ui';

import { PipelineTable } from './components';
import {
  BLUEPRINT_OPTIONS_LIMIT,
  BLUEPRINT_SEARCH_DEBOUNCE_MS,
  BLUEPRINT_TYPE_ALL,
  COPY,
  FILTER_PARAM,
} from './constants';
import { BlueprintSelect } from './styled';
import type { PipelineFilters, PipelineSortKey } from './types';
import { buildPipelineQuery, toBlueprintOptions } from './utils';

const DEFAULT_FILTERS: PipelineFilters = { [FILTER_PARAM.BLUEPRINT]: '' };

export const Pipelines = () => {
  const list = useListState<PipelineSortKey, PipelineFilters>({ filters: DEFAULT_FILTERS });
  const { filters } = list;
  const { version, refresh } = useRefreshVersion();

  const { ready, data, error } = useRefreshData(
    (signal) => API.pipeline.list(buildPipelineQuery(list.query, filters), signal),
    [version, list.query, filters.blueprintId],
  );
  const [searchInput, setSearch] = useState('');
  const search = useDebounce(searchInput, { wait: BLUEPRINT_SEARCH_DEBOUNCE_MS });
  const { data: blueprints } = useRefreshData(
    (signal) =>
      API.blueprint.list(
        {
          page: 1,
          pageSize: BLUEPRINT_OPTIONS_LIMIT,
          type: BLUEPRINT_TYPE_ALL,
          keyword: search || undefined,
          sortBy: 'name',
          sortOrder: SORT_ORDER.ASC,
        },
        signal,
      ),
    [search],
  );
  const { data: selected } = useRefreshData(
    async () => (filters.blueprintId ? API.blueprint.get(filters.blueprintId) : undefined),
    [filters.blueprintId],
  );

  const options = useMemo(() => toBlueprintOptions(blueprints?.blueprints, selected), [blueprints, selected]);

  const empty = buildListEmpty({
    failed: error !== undefined,
    onRetry: refresh,
    filtered: filters.blueprintId !== '',
    empty: COPY.empty,
    noResults: COPY.noResults,
  });

  return (
    <ListPage>
      <PageHeader
        title={COPY.title}
        breadcrumbs={[{ label: COPY.breadcrumbAdvanced, path: PATHS.BLUEPRINTS() }, { label: COPY.title }]}
      />
      <Toolbar
        start={
          <BlueprintSelect
            allowClear
            showSearch={{ filterOption: false, onSearch: setSearch }}
            size="large"
            value={filters.blueprintId || undefined}
            placeholder={COPY.blueprintFilter.placeholder}
            aria-label={COPY.blueprintFilter.label}
            options={options}
            onChange={(blueprintId) => list.setFilter(FILTER_PARAM.BLUEPRINT, String(blueprintId ?? ''))}
          />
        }
      />
      <PipelineTable
        loading={!ready && error === undefined}
        dataSource={data?.pipelines ?? []}
        empty={empty}
        list={list}
        total={data?.count ?? 0}
      />
    </ListPage>
  );
};
