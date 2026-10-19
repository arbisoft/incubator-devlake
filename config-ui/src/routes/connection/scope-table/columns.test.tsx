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
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { getScopeColumns } from './columns';
import { COPY, SCOPE_COLUMN } from './constants';
import type { ScopeColumnOptions, ScopeRow } from './types';

vi.mock('@/plugins', () => ({ ScopeConfig: () => null }));

const ROW: ScopeRow = { id: '1', name: 'org/repo', projects: [] };
const OPTIONS: ScopeColumnOptions = { plugin: 'github', connectionId: 1, onScopeConfigChange: vi.fn() };

const cell = (columns: TableColumnsType<ScopeRow>, key: string, row: ScopeRow) => {
  const column = columns.find((item) => item.key === key);
  const render = column && 'render' in column ? column.render : undefined;
  return render?.(row[key as keyof ScopeRow], row, 0) as ReactNode;
};

describe('scope columns', () => {
  it('leaves the action column out when no row action is provided', () => {
    const keys = getScopeColumns(OPTIONS).map((column) => column.key);
    expect(keys).toEqual([SCOPE_COLUMN.NAME, SCOPE_COLUMN.PROJECTS, SCOPE_COLUMN.SCOPE_CONFIG]);
  });

  it('leaves the projects column out when asked to', () => {
    const keys = getScopeColumns({ ...OPTIONS, showProjects: false }).map((column) => column.key);
    expect(keys).toEqual([SCOPE_COLUMN.NAME, SCOPE_COLUMN.SCOPE_CONFIG]);
  });

  it('names each row action after its scope and reports the row', () => {
    const onClear = vi.fn();
    const onDelete = vi.fn();
    const columns = getScopeColumns({ ...OPTIONS, onClear, onDelete });
    renderWithTheme(<>{cell(columns, SCOPE_COLUMN.ACTIONS, ROW)}</>);
    fireEvent.click(screen.getByRole('button', { name: COPY.clearData(ROW.name) }));
    fireEvent.click(screen.getByRole('button', { name: COPY.deleteScope(ROW.name) }));
    expect(onClear).toHaveBeenCalledWith(ROW);
    expect(onDelete).toHaveBeenCalledWith(ROW);
  });

  it('shows a dash for a scope without projects and links each project otherwise', () => {
    const columns = getScopeColumns(OPTIONS);
    const { unmount } = renderWithTheme(<>{cell(columns, SCOPE_COLUMN.PROJECTS, ROW)}</>);
    expect(screen.getByText('-')).toBeTruthy();
    unmount();
    renderWithTheme(
      <MemoryRouter>{cell(columns, SCOPE_COLUMN.PROJECTS, { ...ROW, projects: ['edly', 'arbisoft'] })}</MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'edly' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'arbisoft' })).toBeTruthy();
  });
});
