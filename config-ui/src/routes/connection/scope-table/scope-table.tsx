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

import { DataTable } from '@/ui';

import { getScopeColumns } from './columns';
import { COPY } from './constants';
import type { ScopeRow, ScopeTableProps } from './types';

export const ScopeTable = ({
  plugin,
  connectionId,
  rows,
  total,
  loading,
  list,
  empty,
  selection,
  onScopeConfigChange,
  onClear,
  onDelete,
}: ScopeTableProps) => {
  const columns = useMemo(
    () => getScopeColumns({ plugin, connectionId, onScopeConfigChange, onClear, onDelete }),
    [plugin, connectionId, onScopeConfigChange, onClear, onDelete],
  );

  return (
    <DataTable<ScopeRow>
      rowKey="id"
      ariaLabel={COPY.tableLabel}
      loading={loading}
      columns={columns}
      dataSource={rows}
      empty={empty}
      list={list}
      total={total}
      rowSelection={{
        selectedRowKeys: selection.selectedIds,
        onChange: (keys) => selection.onChange(keys as ID[]),
      }}
    />
  );
};
