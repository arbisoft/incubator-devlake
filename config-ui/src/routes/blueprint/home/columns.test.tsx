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
import type { TableColumnsType } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { IBPMode, type IBlueprint } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { getColumns } from './columns';
import { BLUEPRINT_COLUMN, COPY } from './constants';

const ROW = {
  id: 7,
  name: 'Arbisoft Website',
  projectName: '',
  mode: IBPMode.NORMAL,
  enable: true,
  isManual: true,
  cronConfig: '',
  connections: [],
} as unknown as IBlueprint;

const find = (columns: TableColumnsType<IBlueprint>, key: string) => columns.find((item) => item.key === key);

const renderCell = (key: string, record: IBlueprint, onConfigure = vi.fn()) => {
  const col = find(getColumns({ onConfigure }), key);
  const value = col && 'dataIndex' in col ? record[col.dataIndex as keyof IBlueprint] : undefined;
  return renderWithTheme(
    <MemoryRouter>
      <>{col && 'render' in col && col.render?.(value, record, 0)}</>
    </MemoryRouter>,
  );
};

describe('blueprint columns', () => {
  it('sorts on the name only', () => {
    const sortable = getColumns({ onConfigure: vi.fn() })
      .filter((item) => 'sorter' in item && item.sorter)
      .map((item) => item.key);
    expect(sortable).toEqual([BLUEPRINT_COLUMN.NAME]);
  });

  it('links the name to the blueprint', () => {
    renderCell(BLUEPRINT_COLUMN.NAME, ROW);
    expect(screen.getByRole('link', { name: ROW.name }).getAttribute('href')).toContain('/7');
  });

  it('says Advanced Mode for an advanced blueprint', () => {
    renderCell(BLUEPRINT_COLUMN.CONNECTIONS, { ...ROW, mode: IBPMode.ADVANCED });
    expect(screen.getByText(COPY.advancedMode)).toBeTruthy();
  });

  it('says N/A when a normal blueprint has no connection', () => {
    renderCell(BLUEPRINT_COLUMN.CONNECTIONS, ROW);
    expect(screen.getByText(COPY.notAvailable)).toBeTruthy();
  });

  it('says N/A when the blueprint belongs to no project, and links the project otherwise', () => {
    const { unmount } = renderCell(BLUEPRINT_COLUMN.PROJECT, ROW);
    expect(screen.getByText(COPY.notAvailable)).toBeTruthy();
    unmount();
    renderCell(BLUEPRINT_COLUMN.PROJECT, { ...ROW, projectName: 'alpha' });
    expect(screen.getByRole('link', { name: 'alpha' }).getAttribute('href')).toContain('alpha');
  });

  it('shows the enable state as text', () => {
    const { unmount } = renderCell(BLUEPRINT_COLUMN.STATUS, ROW);
    expect(screen.getByText(COPY.statusFilter.enabled)).toBeTruthy();
    unmount();
    renderCell(BLUEPRINT_COLUMN.STATUS, { ...ROW, enable: false });
    expect(screen.getByText(COPY.statusFilter.disabled)).toBeTruthy();
  });

  it('opens the configuration through a named icon button', () => {
    const onConfigure = vi.fn();
    renderCell(BLUEPRINT_COLUMN.ACTION, ROW, onConfigure);
    fireEvent.click(screen.getByRole('button', { name: COPY.configure }));
    expect(onConfigure).toHaveBeenCalledWith(ROW.id);
  });
});
