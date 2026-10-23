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
import { BLUEPRINT_COLUMN, COPY, STATUS_FILTER } from './constants';
import type { BlueprintFilters } from './types';
import { getTypeOptions } from './utils';

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

const NO_FILTERS: BlueprintFilters = { connection: [], type: [], projectName: [], status: STATUS_FILTER.ALL };
const CONNECTION_OPTIONS = [{ text: 'arbisoft/website (GitHub)', value: 'github:1' }];
const PROJECT_OPTIONS = [{ text: 'alpha', value: 'alpha' }];

const columnOptions = (onConfigure = vi.fn(), filters: BlueprintFilters = NO_FILTERS) => ({
  onConfigure,
  filters,
  connectionOptions: CONNECTION_OPTIONS,
  projectOptions: PROJECT_OPTIONS,
});

const find = (columns: TableColumnsType<IBlueprint>, key: string) => columns.find((item) => item.key === key);

const renderCell = (key: string, record: IBlueprint, onConfigure = vi.fn()) => {
  const col = find(getColumns(columnOptions(onConfigure)), key);
  const value = col && 'dataIndex' in col ? record[col.dataIndex as keyof IBlueprint] : undefined;
  return renderWithTheme(
    <MemoryRouter>
      <>{col && 'render' in col && col.render?.(value, record, 0)}</>
    </MemoryRouter>,
  );
};

describe('blueprint columns', () => {
  it('sorts on the name only', () => {
    const sortable = getColumns(columnOptions())
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

  it('puts the URL filters on the connections, frequency, project and status columns', () => {
    const columns = getColumns(
      columnOptions(vi.fn(), {
        connection: ['github:1'],
        type: ['Daily', 'Weekly'],
        projectName: ['alpha'],
        status: STATUS_FILTER.DISABLED,
      }),
    );
    expect(find(columns, BLUEPRINT_COLUMN.CONNECTIONS)).toMatchObject({
      filters: CONNECTION_OPTIONS,
      filteredValue: ['github:1'],
      filterMultiple: true,
      filterSearch: true,
    });
    expect(find(columns, BLUEPRINT_COLUMN.FREQUENCY)).toMatchObject({
      filters: getTypeOptions(),
      filteredValue: ['Daily', 'Weekly'],
      filterMultiple: true,
    });
    expect(find(columns, BLUEPRINT_COLUMN.PROJECT)).toMatchObject({
      filters: PROJECT_OPTIONS,
      filteredValue: ['alpha'],
      filterSearch: true,
    });
    expect(find(columns, BLUEPRINT_COLUMN.STATUS)).toMatchObject({
      filters: [
        { text: COPY.statusFilter.enabled, value: STATUS_FILTER.ENABLED },
        { text: COPY.statusFilter.disabled, value: STATUS_FILTER.DISABLED },
      ],
      filteredValue: [STATUS_FILTER.DISABLED],
      filterMultiple: false,
    });
    expect(find(columns, BLUEPRINT_COLUMN.NAME)).not.toHaveProperty('filters');
  });

  it('has no active filter value by default, with the status filter at all', () => {
    const columns = getColumns(columnOptions());
    for (const key of [
      BLUEPRINT_COLUMN.CONNECTIONS,
      BLUEPRINT_COLUMN.FREQUENCY,
      BLUEPRINT_COLUMN.PROJECT,
      BLUEPRINT_COLUMN.STATUS,
    ]) {
      expect(find(columns, key)).toMatchObject({ filteredValue: null });
    }
  });
});
