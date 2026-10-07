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

import { fireEvent, screen, within } from '@testing-library/react';
import type { TableColumnsType } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { SORT_ORDER } from '@/ui/constants';
import { EMPTY_STATE_SIZE } from '@/ui/empty-state';

import { DataTable } from './data-table';
import type { DataTableProps } from './types';

type Row = { id: number; name: string };

const ARIA_LABEL = 'Connections table';
const EMPTY = { title: 'No connections yet', size: EMPTY_STATE_SIZE.SECTION };
const ROWS: Row[] = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
];
const COLUMNS: TableColumnsType<Row> = [
  { key: 'name', title: 'Name', dataIndex: 'name', sorter: true },
  { key: 'id', title: 'Identifier', dataIndex: 'id' },
];

const setup = (props: Partial<DataTableProps<Row>> = {}) =>
  renderWithTheme(
    <DataTable<Row>
      columns={COLUMNS}
      dataSource={ROWS}
      rowKey="id"
      loading={false}
      ariaLabel={ARIA_LABEL}
      empty={EMPTY}
      {...props}
    />,
  );

describe('DataTable', () => {
  it('exposes the table through its accessible name and renders the rows', () => {
    setup();
    const table = screen.getByRole('table', { name: ARIA_LABEL });
    expect(within(table).getByText('Alpha')).toBeTruthy();
    expect(within(table).getByText('Beta')).toBeTruthy();
  });

  it('renders the empty state when there is no data', () => {
    setup({ dataSource: [] });
    expect(screen.getByRole('heading', { name: EMPTY.title })).toBeTruthy();
  });

  it('shows the loading state on first load and hides the empty state', () => {
    const { container } = setup({ dataSource: [], loading: true });
    expect(container.querySelector('.ant-spin-spinning')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: EMPTY.title })).toBeNull();
  });

  it('keeps the rows without a spinner while refreshing', () => {
    const { container } = setup({ loading: true });
    expect(container.querySelector('.ant-spin-spinning')).toBeNull();
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('reports a server sort and marks the sorted column', () => {
    const onChange = vi.fn();
    setup({ sort: { value: { sortBy: 'name', sortOrder: SORT_ORDER.ASC }, onChange } });
    const header = screen.getByRole('columnheader', { name: /Name/ });
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(header);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ sortBy: 'name', sortOrder: SORT_ORDER.DESC });
  });

  it('reports page changes', () => {
    const onPageChange = vi.fn();
    setup({ pagination: { page: 1, pageSize: 1, total: 2, onPageChange, onPageSizeChange: vi.fn() } });
    fireEvent.click(screen.getByTitle('2'));
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('offers the page sizes the caller passes', () => {
    setup({
      pagination: {
        page: 1,
        pageSize: 10,
        total: 100,
        pageSizeOptions: [10, 25],
        onPageChange: vi.fn(),
        onPageSizeChange: vi.fn(),
      },
    });
    fireEvent.mouseDown(screen.getByRole('combobox'));
    expect(screen.getByText('25 / page')).toBeTruthy();
    expect(screen.queryByText('100 / page')).toBeNull();
  });

  it('takes sort and pagination straight from the list state', () => {
    const list = {
      page: 1,
      pageSize: 1,
      sort: { sortBy: 'name', sortOrder: SORT_ORDER.ASC },
      setPage: vi.fn(),
      setPageSize: vi.fn(),
      setSort: vi.fn(),
    };
    setup({ list, total: 2 });
    expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(screen.getByRole('columnheader', { name: 'Name' }));
    expect(list.setSort).toHaveBeenCalledExactlyOnceWith({ sortBy: 'name', sortOrder: SORT_ORDER.DESC });
    fireEvent.click(screen.getByTitle('2'));
    expect(list.setPage).toHaveBeenCalledExactlyOnceWith(2);
  });
});
