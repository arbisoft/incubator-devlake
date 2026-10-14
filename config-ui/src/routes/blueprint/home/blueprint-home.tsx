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

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import type { IBlueprint } from '@/types';
import {
  DataTable,
  FILTER_TABS_VARIANT,
  FilterTabs,
  ListPage,
  ListToolbar,
  PageHeader,
  buildListEmpty,
  useListState,
  useRefreshVersion,
} from '@/ui';

import { getColumns } from './columns';
import { NewBlueprintModal } from './components';
import { CONFIGURATION_TAB_STATE, COPY, LIST_FILTER, STATUS_FILTER, TYPE_FILTER_ALL } from './constants';
import { TypeSelect } from './styled';
import type { BlueprintFilters, BlueprintSortKey } from './types';
import { buildBlueprintQuery, getTypeOptions } from './utils';

const DEFAULT_FILTERS: BlueprintFilters = {
  [LIST_FILTER.TYPE]: TYPE_FILTER_ALL,
  [LIST_FILTER.STATUS]: STATUS_FILTER.ALL,
};
const TYPE_OPTIONS = getTypeOptions();
const STATUS_ITEMS = Object.values(STATUS_FILTER).map((key) => ({ key, label: COPY.statusFilter[key] }));

export const BlueprintHomePage = () => {
  const list = useListState<BlueprintSortKey, BlueprintFilters>({ filters: DEFAULT_FILTERS });
  const { keyword, filters } = list;
  const { version, refresh } = useRefreshVersion();
  const [creating, setCreating] = useState(false);

  const { data, ready, error } = useRefreshData(
    (signal) => API.blueprint.list(buildBlueprintQuery(list.query, filters), signal),
    [version, list.query, filters.type, filters.status],
  );

  const navigate = useNavigate();
  const columns = useMemo(
    () => getColumns({ onConfigure: (id) => navigate(PATHS.BLUEPRINT(id), { state: CONFIGURATION_TAB_STATE }) }),
    [navigate],
  );

  const handleCreated = () => {
    setCreating(false);
    list.setKeyword('');
    refresh();
  };

  const newBlueprintButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
      {COPY.newBlueprint}
    </Button>
  );

  const empty = buildListEmpty({
    failed: error !== undefined,
    onRetry: refresh,
    filtered: keyword !== '' || filters.type !== TYPE_FILTER_ALL || filters.status !== STATUS_FILTER.ALL,
    empty: { ...COPY.empty, action: newBlueprintButton },
    noResults: COPY.noResults,
  });

  return (
    <ListPage>
      <PageHeader
        title={COPY.title}
        description={COPY.description}
        breadcrumbs={[{ label: COPY.breadcrumbAdvanced, path: PATHS.BLUEPRINTS() }, { label: COPY.title }]}
      />
      <ListToolbar
        list={list}
        searchPlaceholder={COPY.searchPlaceholder}
        filters={
          <>
            <FilterTabs
              items={STATUS_ITEMS}
              value={filters.status}
              variant={FILTER_TABS_VARIANT.PILL}
              onChange={(status) => list.setFilter(LIST_FILTER.STATUS, status)}
            />
            <TypeSelect
              size="large"
              value={filters.type}
              prefix={COPY.typeFilterLabel}
              aria-label={COPY.typeFilterLabel}
              options={TYPE_OPTIONS}
              onChange={(type) => list.setFilter(LIST_FILTER.TYPE, String(type))}
            />
          </>
        }
        end={newBlueprintButton}
      />
      <DataTable<IBlueprint, BlueprintSortKey>
        rowKey="id"
        ariaLabel={COPY.tableLabel}
        loading={!ready && error === undefined}
        columns={columns}
        dataSource={data?.blueprints ?? []}
        empty={empty}
        list={list}
        total={data?.count ?? 0}
      />
      <NewBlueprintModal open={creating} onClose={() => setCreating(false)} onCreated={handleCreated} />
    </ListPage>
  );
};
