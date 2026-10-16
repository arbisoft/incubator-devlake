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
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PATHS } from '@/config';
import { selectAllConnections, selectHealth, useHealthChecks, WEBHOOK_PLUGIN } from '@/features/connections';
import { useAppSelector } from '@/hooks';
import { WebHookConnection } from '@/plugins/register/webhook';
import { getPluginConfig } from '@/plugins/utils';
import type { IConnection } from '@/types';
import { buildListEmpty, DataTable, FilterTabs, FILTER_TABS_VARIANT, Toolbar, type SortState } from '@/ui';

import { ConnectionForm } from '../connection-form';
import { ConnectionModal } from '../connection-modal';

import { getColumns } from './columns';
import { COPY, CONNECTION_FILTER, DEFAULT_PAGE_SIZE, FIRST_PAGE, PAGE_SIZES } from './constants';
import { Root } from './styled';
import type { ConnectionFilter, ConnectionListProps, ConnectionSortKey } from './types';
import { useRepoCounts } from './use-repo-counts';
import { buildFilterTabs, filterConnections, pageOf, sortConnections } from './utils';

type EditState = { open: boolean; id?: ID };

const noop = () => undefined;

const PluginConnections = ({ plugin, onCreate }: ConnectionListProps) => {
  const navigate = useNavigate();
  const { name } = getPluginConfig(plugin);
  const [filter, setFilter] = useState<ConnectionFilter>(CONNECTION_FILTER.ALL);
  const [sort, setSort] = useState<SortState<ConnectionSortKey>>();
  const [page, setPage] = useState(FIRST_PAGE);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [edit, setEdit] = useState<EditState>({ open: false });

  const allConnections = useAppSelector(selectAllConnections);
  const health = useAppSelector(selectHealth);
  const connections = useMemo(
    () => allConnections.filter((connection) => connection.plugin === plugin),
    [allConnections, plugin],
  );
  const { check } = useHealthChecks();
  const { counts, load } = useRepoCounts();

  useEffect(() => check(connections), [check, connections]);

  const tabs = useMemo(() => buildFilterTabs(connections, health), [connections, health]);
  const matching = useMemo(
    () => sortConnections(filterConnections(connections, health, filter), sort),
    [connections, health, filter, sort],
  );
  const rows = useMemo(() => pageOf(matching, page, pageSize), [matching, page, pageSize]);

  const columns = getColumns({
    counts,
    onLoadCount: load,
    onDetails: ({ id }) => navigate(PATHS.CONNECTION(plugin, id)),
    onEdit: ({ id }) => setEdit({ open: true, id }),
  });

  const handleFilter = (key: string) => {
    setFilter(key as ConnectionFilter);
    setPage(FIRST_PAGE);
  };

  const closeEdit = () => setEdit((current) => ({ ...current, open: false }));

  const empty = buildListEmpty({
    failed: false,
    onRetry: noop,
    filtered: filter !== CONNECTION_FILTER.ALL,
    empty: COPY.empty,
    noResults: COPY.noResults,
  });

  return (
    <Root>
      <Toolbar
        start={<FilterTabs variant={FILTER_TABS_VARIANT.PILL} items={tabs} value={filter} onChange={handleFilter} />}
        end={
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            {COPY.add}
          </Button>
        }
      />
      <DataTable<IConnection, ConnectionSortKey>
        rowKey="unique"
        ariaLabel={COPY.tableLabel(name)}
        loading={false}
        columns={columns}
        dataSource={rows}
        empty={empty}
        sort={{ value: sort, onChange: setSort }}
        pagination={{
          page,
          pageSize,
          total: matching.length,
          pageSizeOptions: PAGE_SIZES,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(FIRST_PAGE);
          },
        }}
      />
      <ConnectionModal
        open={edit.open}
        plugin={plugin}
        onCancel={closeEdit}
        afterClose={() => setEdit({ open: false })}
      >
        <ConnectionForm plugin={plugin} connectionId={edit.id} onSuccess={closeEdit} />
      </ConnectionModal>
    </Root>
  );
};

export const ConnectionList = ({ plugin, onCreate }: ConnectionListProps) =>
  plugin === WEBHOOK_PLUGIN ? <WebHookConnection /> : <PluginConnections plugin={plugin} onCreate={onCreate} />;
