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

import type { TableColumnsType, TableProps } from 'antd';

import type { EmptyStateProps } from '@/ui/empty-state';
import type { SortState } from '@/ui/types';

type DataTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

type DataTableSort<S extends string> = {
  value?: SortState<S>;
  onChange: (sort?: SortState<S>) => void;
};

type DataTableList<S extends string> = {
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  sort?: SortState<S>;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (sort?: SortState<S>) => void;
};

export type DataTableProps<T extends object, S extends string = string> = {
  columns: TableColumnsType<T>;
  dataSource: T[];
  rowKey: TableProps<T>['rowKey'];
  loading: boolean;
  ariaLabel: string;
  pagination?: DataTablePagination;
  list?: DataTableList<S>;
  total?: number;
  sort?: DataTableSort<S>;
  empty: EmptyStateProps;
  rowSelection?: TableProps<T>['rowSelection'];
  onRow?: TableProps<T>['onRow'];
};

export type ListEmptyOptions = {
  failed: boolean;
  onRetry: () => void;
  filtered: boolean;
  empty: Omit<EmptyStateProps, 'size'>;
  noResults: Omit<EmptyStateProps, 'size'>;
};
