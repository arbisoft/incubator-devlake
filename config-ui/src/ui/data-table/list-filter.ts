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

import type { TableColumnType } from 'antd';
import type { ReactNode } from 'react';

import type { DataTableFilters } from './types';

export type ListFilterOption = { text: ReactNode; value: string };

type ListFilterOptions = { multiple?: boolean; search?: boolean };

// antd resyncs an open dropdown whenever filteredValue changes identity, so unchanged values must keep theirs
const singleValues = new Map<string, string[]>();

const toFilteredValue = (value: string | string[] | undefined): string[] | null => {
  if (Array.isArray(value)) return value.length ? value : null;
  if (!value) return null;
  if (!singleValues.has(value)) singleValues.set(value, [value]);
  return singleValues.get(value) ?? null;
};

export const listFilterProps = <T extends object>(
  value: string | string[] | undefined,
  options: ListFilterOption[],
  { multiple = true, search = false }: ListFilterOptions = {},
): Pick<TableColumnType<T>, 'filters' | 'filteredValue' | 'filterMultiple' | 'filterSearch'> => ({
  filters: options,
  filteredValue: toFilteredValue(value),
  filterMultiple: multiple,
  filterSearch: search,
});

export const toListFilterPatch = <F extends Record<string, string | string[]>>(
  filters: DataTableFilters,
  columns: { [column: string]: { name: keyof F; multiple: boolean } },
): { [K in keyof F]?: F[K] | undefined } => {
  const patch: { [K in keyof F]?: F[K] | undefined } = {};
  for (const [column, { name, multiple }] of Object.entries(columns)) {
    const values = (filters[column] ?? []).map(String);
    if (!values.length) patch[name] = undefined;
    else patch[name] = (multiple ? values : values[0]) as F[keyof F];
  }
  return patch;
};
