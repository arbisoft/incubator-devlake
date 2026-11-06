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
import { BLUEPRINT_VIEW, PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { useConnectionFilterOptions } from '@/routes/connection/use-connection-filter-options';
import type { IBlueprint } from '@/types';
import {
  DataTable,
  ListPage,
  ListToolbar,
  PageHeader,
  buildListEmpty,
  toListFilterPatch,
  useListState,
  useRefreshVersion,
} from '@/ui';

import { getColumns } from './columns';
import { NewBlueprintModal } from './components';
import { BLUEPRINT_COLUMN, COPY, LIST_FILTER, PROJECT_FILTER_OPTIONS_LIMIT, STATUS_FILTER } from './constants';
import type { BlueprintFilters, BlueprintSortKey } from './types';
import { buildBlueprintQuery } from './utils';

const DEFAULT_FILTERS: BlueprintFilters = {
  [LIST_FILTER.CONNECTION]: [],
  [LIST_FILTER.TYPE]: [],
  [LIST_FILTER.PROJECT]: [],
  [LIST_FILTER.STATUS]: STATUS_FILTER.ALL,
};

const FILTER_COLUMNS = {
  [BLUEPRINT_COLUMN.CONNECTIONS]: { name: LIST_FILTER.CONNECTION, multiple: true },
  [BLUEPRINT_COLUMN.FREQUENCY]: { name: LIST_FILTER.TYPE, multiple: true },
  [BLUEPRINT_COLUMN.PROJECT]: { name: LIST_FILTER.PROJECT, multiple: true },
  [BLUEPRINT_COLUMN.STATUS]: { name: LIST_FILTER.STATUS, multiple: false },
};

export const BlueprintHomePage = () => {
  const list = useListState<BlueprintSortKey, BlueprintFilters>({ filters: DEFAULT_FILTERS });
  const { filters } = list;
  const { version, refresh } = useRefreshVersion();
  const [creating, setCreating] = useState(false);

  const { data, ready, error } = useRefreshData(
    (signal) => API.blueprint.list(buildBlueprintQuery(list.query, filters), signal),
    [version, list.query, filters.connection.join(), filters.type.join(), filters.projectName.join(), filters.status],
  );

  const { data: projects } = useRefreshData(
    (signal) => API.project.list({ page: 1, pageSize: PROJECT_FILTER_OPTIONS_LIMIT }, signal),
    [],
  );
  const projectOptions = useMemo(
    () => (projects?.projects ?? []).map(({ name }) => ({ text: name, value: name })),
    [projects],
  );
  const connectionOptions = useConnectionFilterOptions({ includeOtel: false });

  const navigate = useNavigate();
  const columns = useMemo(
    () =>
      getColumns({
        onConfigure: (id) => navigate(PATHS.BLUEPRINT_VIEW(id, BLUEPRINT_VIEW.CONFIGURATION)),
        filters,
        connectionOptions,
        projectOptions,
      }),
    [navigate, filters, connectionOptions, projectOptions],
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
    filtered: list.isFiltered,
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
      <ListToolbar list={list} searchPlaceholder={COPY.searchPlaceholder} end={newBlueprintButton} />
      <DataTable<IBlueprint, BlueprintSortKey>
        rowKey="id"
        ariaLabel={COPY.tableLabel}
        loading={!ready && error === undefined}
        columns={columns}
        dataSource={data?.blueprints ?? []}
        empty={empty}
        list={list}
        onFilterChange={(changed) => list.setFilters(toListFilterPatch(changed, FILTER_COLUMNS))}
        total={data?.count ?? 0}
      />
      <NewBlueprintModal open={creating} onClose={() => setCreating(false)} onCreated={handleCreated} />
    </ListPage>
  );
};
