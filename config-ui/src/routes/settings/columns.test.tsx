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
import { LAYOUT } from '@/theme/scales';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { buildActionsColumn, buildRoleColumn, buildStatusColumn } from './columns';
import type { ActionsColumnOptions } from './columns.types';
import { ACTIONS_LAYOUT, COPY } from './constants';

type Row = { name: string; status: AccessUser['status'] };

const renderCell = <T extends object>(column: TableColumnType<T>, row: T) =>
  renderWithTheme(<>{column.render?.(undefined, row, 0)}</>);

const actionsColumnOptions = (onToggle = vi.fn(), onRemove = vi.fn()): ActionsColumnOptions<Row> => ({
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

const actionsColumn = (onToggle = vi.fn(), onRemove = vi.fn()) =>
  buildActionsColumn<Row>(actionsColumnOptions(onToggle, onRemove));

describe('buildStatusColumn', () => {
  const column = buildStatusColumn<Row>({
    key: 'status',
    title: COPY.users.columns.status,
    getStatus: (row) => row.status,
    labels: COPY.users.status,
  });

  it('adds no filter unless asked', () => {
    expect(column.filters).toBeUndefined();
    expect(column.filteredValue).toBeUndefined();
  });

  it('offers a single-choice filter and reports the chosen value as the filtered value', () => {
    const options = [{ text: COPY.users.status[ACCESS_STATUS.ACTIVE], value: ACCESS_STATUS.ACTIVE }];
    const filtered = buildStatusColumn<Row>({
      key: 'status',
      title: COPY.users.columns.status,
      getStatus: (row) => row.status,
      labels: COPY.users.status,
      filter: { value: ACCESS_STATUS.ACTIVE, options },
    });
    expect(filtered.filters).toEqual(options);
    expect(filtered.filterMultiple).toBe(false);
    expect(filtered.filteredValue).toEqual([ACCESS_STATUS.ACTIVE]);
    expect(
      buildStatusColumn<Row>({
        ...{ key: 'status', title: 'S', getStatus: (row) => row.status, labels: COPY.users.status },
        filter: { options },
      }).filteredValue,
    ).toBeNull();
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

describe('buildActionsColumn options', () => {
  it('hides Enable/Disable and remove when the row cannot toggle or be removed', () => {
    const column = buildActionsColumn<Row>({
      ...actionsColumnOptions(),
      canToggle: () => false,
      canRemove: () => false,
      renderExtra: (row) => <span>{`extra ${row.name}`}</span>,
    });
    renderCell(column, { name: 'Ada', status: ACCESS_STATUS.ACTIVE });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('extra Ada')).toBeTruthy();
  });
});

describe('buildActionsColumn icon layout', () => {
  const extraCalls = [vi.fn(), vi.fn()];
  const iconColumn = (overrides: Partial<ActionsColumnOptions<Row>> = {}, onToggle = vi.fn(), onRemove = vi.fn()) =>
    buildActionsColumn<Row>({
      ...actionsColumnOptions(onToggle, onRemove),
      layout: ACTIONS_LAYOUT.ICONS,
      extraActions: (row) =>
        extraCalls.map((onClick, index) => ({
          key: `extra-${index}`,
          icon: <span />,
          label: `Extra ${index} ${row.name}`,
          onClick,
        })),
      ...overrides,
    });
  const labels = () => screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));

  it('centres the column and gives it the icon width', () => {
    const column = iconColumn();
    expect(column.align).toBe('center');
    expect(column.width).toBe(LAYOUT.accessIconActionsColumnWidth);
  });

  it('renders extras, then the danger disable icon, then the danger delete icon', () => {
    renderCell(iconColumn(), { name: 'Ada', status: ACCESS_STATUS.ACTIVE });
    expect(labels()).toEqual(['Extra 0 Ada', 'Extra 1 Ada', COPY.users.disable('Ada'), COPY.users.remove('Ada')]);
    expect(screen.getByRole('button', { name: COPY.users.disable('Ada') }).className).toContain('ant-btn-dangerous');
    expect(screen.getByRole('button', { name: COPY.users.remove('Ada') }).className).toContain('ant-btn-dangerous');
    expect(screen.getByRole('button', { name: 'Extra 0 Ada' }).className).not.toContain('ant-btn-dangerous');
  });

  it('shows a neutral enable icon for a disabled row and reports the actions', () => {
    const onToggle = vi.fn();
    const onRemove = vi.fn();
    const row = { name: 'Ada', status: ACCESS_STATUS.DISABLED };
    renderCell(iconColumn({}, onToggle, onRemove), row);
    const enable = screen.getByRole('button', { name: COPY.users.enable('Ada') });
    expect(enable.className).not.toContain('ant-btn-dangerous');
    fireEvent.click(enable);
    expect(onToggle).toHaveBeenCalledWith(row, ACCESS_STATUS.ACTIVE);
    fireEvent.click(screen.getByRole('button', { name: 'Extra 1 Ada' }));
    expect(extraCalls[1]).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: COPY.users.remove('Ada') }));
    expect(onRemove).toHaveBeenCalledWith(row);
  });

  it('renders no icons for a protected row without extras', () => {
    const column = iconColumn({ canToggle: () => false, canRemove: () => false, extraActions: () => [] });
    renderCell(column, { name: 'Ada', status: ACCESS_STATUS.ACTIVE });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the text layout right-aligned by default', () => {
    expect(actionsColumn().align).toBe('right');
  });
});

describe('buildRoleColumn', () => {
  type RoleRow = { name: string; role: string };
  const base = {
    key: 'role',
    title: 'Role',
    getRole: (row: RoleRow) => row.role,
    getLabel: (row: RoleRow) => `Role for ${row.name}`,
  };

  it('keeps the DevLake roles by default and reports the change', () => {
    const onChange = vi.fn();
    const row = { name: 'Ada', role: 'member' };
    renderCell(buildRoleColumn<RoleRow>({ ...base, onChange }), row);
    expect(screen.getByRole('combobox', { name: 'Role for Ada' })).toBeTruthy();
  });

  it('renders a role outside the options as text', () => {
    renderCell(
      buildRoleColumn<RoleRow, 'a' | 'b'>({
        ...base,
        options: [{ value: 'a', label: 'A' }],
        onChange: vi.fn(),
      }),
      { name: 'Ada', role: 'weird' },
    );
    expect(screen.getByText('weird')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('disables the select when a locked reason is given', () => {
    renderCell(
      buildRoleColumn<RoleRow, 'a' | 'b'>({
        ...base,
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        getLockedReason: () => 'Locked',
        onChange: vi.fn(),
      }),
      { name: 'Ada', role: 'a' },
    );
    expect((screen.getByRole('combobox', { name: 'Role for Ada' }) as HTMLInputElement).disabled).toBe(true);
  });

  describe('pending rows', () => {
    const ada = { name: 'Ada', role: 'a' };
    const bob = { name: 'Bob', role: 'a' };
    const selectFor = (row: RoleRow) =>
      screen.getByRole('combobox', { name: `Role for ${row.name}` }) as HTMLInputElement;
    const isLoading = (row: RoleRow) => selectFor(row).closest('.ant-select')?.classList.contains('ant-select-loading');
    const column = buildRoleColumn<RoleRow, 'a' | 'b'>({
      ...base,
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      getLockedReason: (row) => (row.name === 'Locked' ? 'Locked' : undefined),
      isPending: (row) => row.name === 'Ada' || row.name === 'Locked',
      onChange: vi.fn(),
    });

    it('disables and marks as loading only the pending row', () => {
      renderWithTheme(
        <>
          {column.render?.(undefined, ada, 0)}
          {column.render?.(undefined, bob, 1)}
        </>,
      );
      expect(selectFor(ada).disabled).toBe(true);
      expect(isLoading(ada)).toBe(true);
      expect(selectFor(bob).disabled).toBe(false);
      expect(isLoading(bob)).toBe(false);
    });

    it('keeps a locked row disabled while it is pending', () => {
      renderCell(column, { name: 'Locked', role: 'a' });
      expect(selectFor({ name: 'Locked', role: 'a' }).disabled).toBe(true);
    });

    it('is not pending unless asked', () => {
      renderCell(buildRoleColumn<RoleRow>({ ...base, onChange: vi.fn() }), { ...ada, role: 'member' });
      expect(selectFor(ada).disabled).toBe(false);
      expect(isLoading(ada)).toBe(false);
    });
  });
});
