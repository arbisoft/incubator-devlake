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

import type { TableColumnsType } from 'antd';
import type { SorterResult } from 'antd/es/table/interface';

import { SORT_ORDER } from '@/ui/constants';
import type { SortState } from '@/ui/types';

import { ANTD_SORT_ORDER } from './constants';

const columnKey = <T extends object>(column: TableColumnsType<T>[number]): string | undefined => {
  if (column.key !== undefined) return String(column.key);
  return 'dataIndex' in column && column.dataIndex !== undefined ? String(column.dataIndex) : undefined;
};

export const withSortOrder = <T extends object>(columns: TableColumnsType<T>, sort?: SortState<string>) =>
  columns.map((column) => {
    if (!('sorter' in column) || !column.sorter) return column;
    const active = sort !== undefined && columnKey(column) === sort.sortBy;
    const sortOrder = active && sort.sortOrder === SORT_ORDER.ASC ? ANTD_SORT_ORDER.ASC : ANTD_SORT_ORDER.DESC;
    return { ...column, sortOrder: active ? sortOrder : null };
  });

export const toSortState = <T extends object, S extends string = string>(
  sorter: SorterResult<T> | SorterResult<T>[],
): SortState<S> | undefined => {
  const [first] = Array.isArray(sorter) ? sorter : [sorter];
  if (!first?.order || first.columnKey === undefined) return undefined;
  return {
    sortBy: String(first.columnKey) as S,
    sortOrder: first.order === ANTD_SORT_ORDER.ASC ? SORT_ORDER.ASC : SORT_ORDER.DESC,
  };
};
