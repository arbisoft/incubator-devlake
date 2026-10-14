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

import { fireEvent, screen } from '@testing-library/react';
import type { TableColumnType } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import { ACCESS_STATUS, type AccessUser } from '@/api/access';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { buildActionsColumn, buildStatusColumn } from './columns';
import { COPY } from './constants';

type Row = { name: string; status: AccessUser['status'] };

const renderCell = (column: TableColumnType<Row>, row: Row) =>
  renderWithTheme(<>{column.render?.(undefined, row, 0)}</>);

const actionsColumn = (onToggle = vi.fn(), onRemove = vi.fn()) =>
  buildActionsColumn<Row>({
    key: 'actions',
    title: COPY.users.columns.actions,
    getStatus: (row) => row.status,
    getName: (row) => row.name,
    labels: {
      enable: COPY.actions.enable,
      disable: COPY.actions.disable,
      enableFor: COPY.users.enable,
      disableFor: COPY.users.disable,
      removeFor: COPY.users.remove,
    },
    onToggle,
    onRemove,
  });

describe('buildStatusColumn', () => {
  const column = buildStatusColumn<Row>({
    key: 'status',
    title: COPY.users.columns.status,
    getStatus: (row) => row.status,
    labels: COPY.users.status,
  });

  it('shows the label for the row status as text', () => {
    renderCell(column, { name: 'Ada', status: ACCESS_STATUS.ACTIVE });
    expect(screen.getByText(COPY.users.status[ACCESS_STATUS.ACTIVE])).toBeTruthy();
  });

  it('shows a disabled row with its own label', () => {
    renderCell(column, { name: 'Ada', status: ACCESS_STATUS.DISABLED });
    expect(screen.getByText(COPY.users.status[ACCESS_STATUS.DISABLED])).toBeTruthy();
  });
});

describe('buildActionsColumn', () => {
  it('offers Disable for an active row and asks for the disabled status', () => {
    const onToggle = vi.fn();
    const row = { name: 'Ada', status: ACCESS_STATUS.ACTIVE };
    renderCell(actionsColumn(onToggle), row);
    fireEvent.click(screen.getByRole('button', { name: COPY.users.disable('Ada') }));
    expect(onToggle).toHaveBeenCalledWith(row, ACCESS_STATUS.DISABLED);
  });

  it('offers Enable for a disabled row and asks for the active status', () => {
    const onToggle = vi.fn();
    const row = { name: 'Ada', status: ACCESS_STATUS.DISABLED };
    renderCell(actionsColumn(onToggle), row);
    fireEvent.click(screen.getByRole('button', { name: COPY.users.enable('Ada') }));
    expect(onToggle).toHaveBeenCalledWith(row, ACCESS_STATUS.ACTIVE);
  });

  it('names the remove button after the row and reports the row', () => {
    const onRemove = vi.fn();
    const row = { name: 'Ada', status: ACCESS_STATUS.ACTIVE };
    renderCell(actionsColumn(vi.fn(), onRemove), row);
    fireEvent.click(screen.getByRole('button', { name: COPY.users.remove('Ada') }));
    expect(onRemove).toHaveBeenCalledWith(row);
  });
});
