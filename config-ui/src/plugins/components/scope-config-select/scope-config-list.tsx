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
import { useState } from 'react';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { buildListEmpty, DataTable, MODAL_WIDTH, useRefreshVersion } from '@/ui';

import { ConnectionModal } from '../connection-modal';
import { ScopeConfigForm } from '../scope-config-form';

import { COPY } from './constants';
import { Stack, Toolbar } from './styled';
import type { ScopeConfigListProps, ScopeConfigRow } from './types';
import { toScopeConfigRows } from './utils';

const COLUMNS = [{ title: COPY.nameColumn, dataIndex: 'name', key: 'name' }];

export const ScopeConfigList = ({
  plugin,
  connectionId,
  scopeConfigId,
  selectedId,
  onSelect,
}: ScopeConfigListProps) => {
  const [adding, setAdding] = useState(false);
  const { version, refresh } = useRefreshVersion();

  const { ready, data, error } = useRefreshData<ScopeConfigRow[]>(
    (signal) => API.scopeConfig.list(plugin, connectionId, signal),
    [plugin, connectionId, version],
  );

  const handleCreated = (id: ID) => {
    setAdding(false);
    refresh();
    onSelect(id);
  };

  return (
    <Stack>
      <Toolbar>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          {COPY.add}
        </Button>
      </Toolbar>
      <DataTable<ScopeConfigRow>
        rowKey="id"
        ariaLabel={COPY.tableLabel}
        loading={!ready && error === undefined}
        columns={COLUMNS}
        dataSource={toScopeConfigRows(data, !!scopeConfigId)}
        pagination={false}
        empty={buildListEmpty({
          failed: error !== undefined,
          onRetry: refresh,
          filtered: false,
          empty: COPY.empty,
          noResults: COPY.empty,
        })}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedId ? [selectedId] : [],
          onChange: (keys) => onSelect(keys[0] as ID),
        }}
        onRow={(row) => ({ onClick: () => onSelect(row.id) })}
      />
      <ConnectionModal
        open={adding}
        plugin={plugin}
        title={COPY.addTitle}
        width={MODAL_WIDTH.LG}
        onCancel={() => setAdding(false)}
      >
        <ScopeConfigForm
          plugin={plugin}
          connectionId={connectionId}
          defaultName={COPY.defaultName((data ?? []).length)}
          onCancel={() => setAdding(false)}
          onSubmit={handleCreated}
        />
      </ConnectionModal>
    </Stack>
  );
};
