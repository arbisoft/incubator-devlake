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

import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import type { TableColumnsType } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { IPipelineStatus } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY, MAX_VISIBLE_CONNECTIONS, PROJECT_COLUMN } from './constants';
import type { ProjectRow } from './types';
import { useProjectColumns } from './use-project-columns';

const ROW: ProjectRow = {
  name: 'alpha',
  connections: [],
  otelConnections: [],
  isManual: true,
  cronConfig: '',
  createdAt: '2026-06-06T16:00:00Z',
  lastRunCompletedAt: null,
};

const columnsFor = (onConfigure = vi.fn()) => renderHook(() => useProjectColumns(onConfigure)).result.current.columns;

const find = (all: TableColumnsType<ProjectRow>, key: string) => all.find((item) => item.key === key);

const renderCell = (key: string, record: ProjectRow, value?: unknown) => {
  const col = find(columnsFor(), key);
  return renderWithTheme(
    <MemoryRouter>
      <>{col && 'render' in col && col.render?.(value, record, 0)}</>
    </MemoryRouter>,
  );
};

describe('useProjectColumns', () => {
  it('sorts on name, created and last run only', () => {
    const sortable = columnsFor()
      .filter((item) => 'sorter' in item && item.sorter)
      .map((item) => item.key);
    expect(sortable).toEqual([PROJECT_COLUMN.NAME, PROJECT_COLUMN.CREATED_AT, PROJECT_COLUMN.LAST_RUN_AT]);
  });

  it('links the name to the project', () => {
    renderCell(PROJECT_COLUMN.NAME, ROW, ROW.name);
    expect(screen.getByRole('link', { name: ROW.name }).getAttribute('href')).toContain('alpha');
  });

  it('says N/A when there is no connection of any kind', () => {
    renderCell(PROJECT_COLUMN.CONNECTIONS, ROW);
    expect(screen.getByText(COPY.noConnections)).toBeTruthy();
  });

  it('lists the OTel connection names', () => {
    const otelConnections = [{ connection: { id: 3, name: 'claude-team' }, projects: [] }] as never;
    renderCell(PROJECT_COLUMN.CONNECTIONS, { ...ROW, otelConnections });
    expect(screen.getByText('claude-team')).toBeTruthy();
  });

  it('caps the connections and keeps the rest reachable from a focusable toggle', async () => {
    const otelConnections = [1, 2, 3, 4].map((id) => ({
      connection: { id, name: `team-${id}` },
      projects: [],
    })) as never;
    renderCell(PROJECT_COLUMN.CONNECTIONS, { ...ROW, otelConnections });
    const hidden = 4 - MAX_VISIBLE_CONNECTIONS;
    expect(screen.queryByText('team-3')).toBeNull();
    fireEvent.focus(screen.getByRole('button', { name: COPY.moreConnections(hidden) }));
    await waitFor(() => expect(screen.getByText('team-4')).toBeTruthy());
    expect(screen.getByText('team-3')).toBeTruthy();
  });

  it('shows a dash when the project has not run', () => {
    renderCell(PROJECT_COLUMN.LAST_RUN_AT, ROW, null);
    expect(screen.getByText('-')).toBeTruthy();
  });

  it('shows the last run status as text', () => {
    renderCell(PROJECT_COLUMN.LAST_RUN_STATUS, ROW, IPipelineStatus.FAILED);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('opens the configuration through an icon button with a name', () => {
    const onConfigure = vi.fn();
    const col = find(columnsFor(onConfigure), PROJECT_COLUMN.ACTION);
    renderWithTheme(<>{col && 'render' in col && col.render?.(undefined, ROW, 0)}</>);
    screen.getByRole('button', { name: COPY.configure }).click();
    expect(onConfigure).toHaveBeenCalledWith(ROW.name);
  });
});
