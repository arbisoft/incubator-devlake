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

import { Button, type TableColumnsType } from 'antd';
import { useMemo, useState, type Key } from 'react';

import {
  DataTable,
  EMPTY_ILLUSTRATION,
  EMPTY_STATE_SIZE,
  IdentityCell,
  SORT_ORDER,
  STATUS_TONE,
  StatusBadge,
  useListState,
} from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { TABLE_LIST_DEFAULTS, TABLE_ROWS, TABLE_SELECTED_ROWS } from './fixtures';
import { Mono, Narrow } from './styled';
import type { UserRow } from './types';

const { dataTable: text } = COPY;
const COLUMN_WIDTH = 180;
const LONG_COLUMN_WIDTH = 320;

const columns: TableColumnsType<UserRow> = [
  {
    key: 'name',
    title: text.user,
    dataIndex: 'name',
    sorter: true,
    render: (_, row) => <IdentityCell primary={row.name} secondary={row.email} />,
  },
  { key: 'role', title: text.role, dataIndex: 'role', sorter: true },
  {
    key: 'status',
    title: text.status,
    dataIndex: 'status',
    render: (status: UserRow['status']) => (
      <StatusBadge
        tone={status === 'active' ? STATUS_TONE.SUCCESS : STATUS_TONE.NEUTRAL}
        label={status === 'active' ? text.active : text.inactive}
        variant="dot"
      />
    ),
  },
  {
    key: 'note',
    title: text.note,
    dataIndex: 'hasNote',
    render: (hasNote: boolean) => (hasNote ? text.longNote : null),
  },
];

const fixedWidthColumns: TableColumnsType<UserRow> = columns.map((column) => ({
  ...column,
  width: column.key === 'note' ? LONG_COLUMN_WIDTH : COLUMN_WIDTH,
}));

const compare = (a: UserRow, b: UserRow, key: string) =>
  String(a[key as keyof UserRow]).localeCompare(String(b[key as keyof UserRow]));

const empty = { title: text.emptyTitle, description: text.emptyDescription, size: EMPTY_STATE_SIZE.SECTION };

const ServerTable = () => {
  const list = useListState<string, Record<string, string>>(TABLE_LIST_DEFAULTS);
  const sorted = useMemo(() => {
    const { sort } = list;
    if (!sort) return TABLE_ROWS;
    const factor = sort.sortOrder === SORT_ORDER.ASC ? 1 : -1;
    return [...TABLE_ROWS].sort((a, b) => factor * compare(a, b, sort.sortBy));
  }, [list]);
  const start = (list.page - 1) * list.pageSize;

  return (
    <>
      <DataTable<UserRow>
        columns={columns}
        dataSource={sorted.slice(start, start + list.pageSize)}
        rowKey="id"
        loading={false}
        ariaLabel={text.ariaLabel}
        empty={empty}
        list={list}
        total={sorted.length}
      />
      <Mono>{JSON.stringify(list.toQuery())}</Mono>
    </>
  );
};

const SelectableTable = () => {
  const [selected, setSelected] = useState<Key[]>(TABLE_SELECTED_ROWS);
  return (
    <>
      <DataTable<UserRow>
        columns={columns}
        dataSource={TABLE_ROWS.slice(0, 4)}
        rowKey="id"
        loading={false}
        ariaLabel={text.ariaLabel}
        empty={empty}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
      />
      <span role="status">{text.selected(selected.length)}</span>
    </>
  );
};

export const DataTableDemo = () => (
  <DemoSection id={SECTION.DATA_TABLE} title={COPY.sections.dataTable}>
    <DemoCase label={COPY.cases.sortAndPaginate}>
      <ServerTable />
    </DemoCase>
    <DemoCase label={COPY.cases.fixedWidthTable}>
      <DataTable<UserRow>
        columns={fixedWidthColumns}
        dataSource={TABLE_ROWS.slice(0, 2)}
        rowKey="id"
        loading={false}
        ariaLabel={text.ariaLabel}
        empty={empty}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.selectable}>
      <SelectableTable />
    </DemoCase>
    <DemoCase label={COPY.cases.loading}>
      <DataTable<UserRow>
        columns={columns}
        dataSource={[]}
        rowKey="id"
        loading
        ariaLabel={text.ariaLabel}
        empty={empty}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.empty}>
      <DataTable<UserRow>
        columns={columns}
        dataSource={[]}
        rowKey="id"
        loading={false}
        ariaLabel={text.ariaLabel}
        empty={{
          ...empty,
          illustration: EMPTY_ILLUSTRATION.NO_USERS,
          action: <Button type="primary">{text.retry}</Button>,
        }}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.error}>
      <DataTable<UserRow>
        columns={columns}
        dataSource={[]}
        rowKey="id"
        loading={false}
        ariaLabel={text.ariaLabel}
        empty={{
          illustration: EMPTY_ILLUSTRATION.ERROR,
          title: text.errorTitle,
          description: text.errorDescription,
          action: <Button type="primary">{text.retry}</Button>,
          size: EMPTY_STATE_SIZE.SECTION,
        }}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <DataTable<UserRow>
          columns={columns}
          dataSource={TABLE_ROWS.slice(0, 2)}
          rowKey="id"
          loading={false}
          ariaLabel={text.ariaLabel}
          empty={empty}
        />
      </Narrow>
    </DemoCase>
  </DemoSection>
);
