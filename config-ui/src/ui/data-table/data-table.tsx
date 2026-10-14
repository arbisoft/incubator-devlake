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

import { PAGE_SIZE_OPTIONS } from '@/ui/constants';
import { EmptyState } from '@/ui/empty-state';

import { Table } from './styled';
import type { DataTableProps } from './types';
import { getHorizontalScroll, toSortState, withSortOrder } from './utils';

const SIZE_OPTIONS = [...PAGE_SIZE_OPTIONS];

export const DataTable = <T extends object, S extends string = string>({
  columns,
  dataSource,
  rowKey,
  loading,
  ariaLabel,
  pagination: paginationProp,
  list,
  total = 0,
  sort: sortProp,
  empty,
  rowSelection,
  onRow,
}: DataTableProps<T, S>) => {
  const sort = sortProp ?? (list && { value: list.sort, onChange: list.setSort });
  const pagination =
    paginationProp ??
    (list && {
      page: list.page,
      pageSize: list.pageSize,
      total,
      pageSizeOptions: list.pageSizeOptions,
      onPageChange: list.setPage,
      onPageSizeChange: list.setPageSize,
    });
  const sortedColumns = useMemo(() => withSortOrder(columns, sort?.value), [columns, sort?.value]);
  const firstLoad = loading && dataSource.length === 0;

  return (
    <Table<T>
      aria-label={ariaLabel}
      columns={sortedColumns}
      dataSource={dataSource}
      rowKey={rowKey}
      loading={firstLoad}
      rowSelection={rowSelection}
      onRow={onRow}
      scroll={{ x: getHorizontalScroll(columns) }}
      locale={{ emptyText: firstLoad ? null : <EmptyState {...empty} /> }}
      pagination={
        pagination && {
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          pageSizeOptions: [...(pagination.pageSizeOptions ?? SIZE_OPTIONS)],
          placement: ['bottomCenter'],
          onChange: (page, pageSize) =>
            pageSize === pagination.pageSize ? pagination.onPageChange(page) : pagination.onPageSizeChange(pageSize),
        }
      }
      onChange={(_, __, sorter, { action }) => action === 'sort' && sort?.onChange(toSortState<T, S>(sorter))}
    />
  );
};
