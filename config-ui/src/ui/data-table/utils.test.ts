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

import type { SorterResult } from 'antd/es/table/interface';
import { describe, expect, it } from 'vitest';

import { SORT_ORDER } from '@/ui/constants';

import { toSortState } from './utils';

type Row = { id: number; profile: { name: string } };

describe('toSortState', () => {
  it('uses a sorter field when an Ant Design column has no key', () => {
    const sorter: SorterResult<Row> = { field: 'name', order: 'ascend' };
    expect(toSortState(sorter)).toEqual({ sortBy: 'name', sortOrder: SORT_ORDER.ASC });
  });

  it('keeps the array dataIndex key convention', () => {
    const sorter: SorterResult<Row> = { field: ['profile', 'name'], order: 'ascend' };
    expect(toSortState(sorter)).toEqual({ sortBy: 'profile,name', sortOrder: SORT_ORDER.ASC });
  });

  it('uses a nested array dataIndex when the sorter does not include a field', () => {
    const column = { title: 'Profile name', dataIndex: ['profile', 'name'], sorter: true };
    const sorter: SorterResult<Row> = { column, order: 'ascend' };
    expect(toSortState(sorter)).toEqual({ sortBy: 'profile,name', sortOrder: SORT_ORDER.ASC });
  });

  it('preserves an explicit column key before the field', () => {
    const sorter: SorterResult<Row> = { columnKey: 0, field: 'name', order: 'ascend' };
    expect(toSortState(sorter)).toEqual({ sortBy: '0', sortOrder: SORT_ORDER.ASC });
  });

  it('normalizes a bigint column key', () => {
    const sorter: SorterResult<Row> = { columnKey: 7n, field: 'name', order: 'ascend' };
    expect(toSortState(sorter)).toEqual({ sortBy: '7', sortOrder: SORT_ORDER.ASC });
  });

  it('clears sorting when the first sorter has no order', () => {
    const sorter: SorterResult<Row> = { columnKey: 'name', field: 'name' };
    expect(toSortState(sorter)).toBeUndefined();
  });
});
