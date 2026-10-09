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

import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { TableColumnsType } from 'antd';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ComplianceScorecardRow } from '@/api/compliance-scorecard';
import { connectionsSlice } from '@/features/connections';
import { INTEGRATION_CATEGORY } from '@/plugins/catalog';
import { IPipelineStatus } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY as READINESS_COPY, toReadinessMap } from '../readiness';

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

const SCORECARD_ROW: ComplianceScorecardRow = {
  Project: 'alpha',
  'Issue Visibility': '✅ Jira',
  'PR Visibility': '✅ GitHub',
  'AI Visibility': '❌ Not available',
  Compliance: '⚠️ 66.6%',
};

const columnsFor = (onConfigure = vi.fn(), rows: ComplianceScorecardRow[] = [SCORECARD_ROW]) =>
  renderHook(() => useProjectColumns(onConfigure, toReadinessMap(rows))).result.current.columns;

const makeStore = () =>
  configureStore({
    reducer: { connections: connectionsSlice.reducer },
    preloadedState: {
      connections: {
        ...connectionsSlice.getInitialState(),
        connections: [{ unique: 'github-1', plugin: 'github', id: 1, name: 'arbisoft/website' }],
      },
    },
  } as never);

const otelRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    connection: { id: index + 1, name: `team-${index + 1}` },
    projects: [],
  })) as never;

const find = (all: TableColumnsType<ProjectRow>, key: string) => all.find((item) => item.key === key);

const renderCell = (key: string, record: ProjectRow, value?: unknown, rows?: ComplianceScorecardRow[]) => {
  const col = find(columnsFor(vi.fn(), rows), key);
  return renderWithTheme(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <>{col && 'render' in col && col.render?.(value, record, 0)}</>
      </MemoryRouter>
    </Provider>,
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

  it('names the trigger after every connection while the icons stay hidden', () => {
    const otelConnections = [{ connection: { id: 3, name: 'claude-team' }, projects: [] }] as never;
    renderCell(PROJECT_COLUMN.CONNECTIONS, {
      ...ROW,
      connections: [{ pluginName: 'github', connectionId: 1 }],
      otelConnections,
    });
    const trigger = screen.getByRole('button', { name: COPY.connectionsLabel(['arbisoft/website', 'claude-team']) });
    expect(trigger.querySelector('ul, li')).toBeNull();
  });

  it('caps the icons and shows the rest as a count', () => {
    const otelConnections = otelRows(7);
    renderCell(PROJECT_COLUMN.CONNECTIONS, { ...ROW, otelConnections });
    const trigger = screen.getByRole('button');
    expect(trigger.querySelectorAll('svg, img, [class*="Icon"]').length).toBeGreaterThan(0);
    expect(screen.getByText(COPY.moreConnections(7 - MAX_VISIBLE_CONNECTIONS))).toBeTruthy();
  });

  it('lists every connection, with plugin and category, in the popover', async () => {
    const otelConnections = otelRows(7);
    renderCell(PROJECT_COLUMN.CONNECTIONS, {
      ...ROW,
      connections: [{ pluginName: 'github', connectionId: 1 }],
      otelConnections,
    });
    fireEvent.focus(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('team-7')).toBeTruthy());
    expect(screen.getByText(COPY.connectionsPopover.title)).toBeTruthy();
    expect(screen.getByText(COPY.connectionsPopover.subtitle('GitHub', INTEGRATION_CATEGORY.CODE_SCM))).toBeTruthy();
    const aiChip = screen.getByText(INTEGRATION_CATEGORY.AI_ANALYTICS).closest('li') as HTMLElement;
    expect(within(aiChip).getByText('7')).toBeTruthy();
    const scmChip = screen.getByText(INTEGRATION_CATEGORY.CODE_SCM).closest('li') as HTMLElement;
    expect(within(scmChip).getByText('1')).toBeTruthy();
  });

  it('shows the empty value when the project has no scorecard row', () => {
    renderCell(PROJECT_COLUMN.READINESS, { ...ROW, name: 'missing' });
    expect(screen.getByText('-')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the meter and the API percentage in a focusable trigger', () => {
    renderCell(PROJECT_COLUMN.READINESS, ROW);
    expect(screen.getByRole('img', { name: READINESS_COPY.summary(2, 3) })).toBeTruthy();
    expect(screen.getByRole('button').querySelector('ul, li, div')).toBeNull();
    expect(screen.getByRole('button').textContent).toContain('66.6%');
  });

  it('opens the breakdown with the missing hint and a link to the configurations', async () => {
    renderCell(PROJECT_COLUMN.READINESS, ROW);
    fireEvent.focus(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(READINESS_COPY.title)).toBeTruthy());
    expect(screen.getByText(COPY.readinessPopover.projectSummary(2, 3))).toBeTruthy();
    expect(screen.getByText('Jira')).toBeTruthy();
    expect(screen.getByText(READINESS_COPY.notAvailable)).toBeTruthy();
    expect(screen.getByText(READINESS_COPY.missingHint([READINESS_COPY.signals.ai.missing]))).toBeTruthy();
    const link = screen.getByRole('link', { name: READINESS_COPY.addConnection });
    expect(link.getAttribute('href')).toContain('alpha');
  });

  it('omits the footer when every signal is available', async () => {
    renderCell(PROJECT_COLUMN.READINESS, ROW, undefined, [
      { ...SCORECARD_ROW, 'AI Visibility': '✅ Claude Code (OTel)', Compliance: '✅ 100%' },
    ]);
    fireEvent.focus(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(READINESS_COPY.title)).toBeTruthy());
    expect(screen.queryByRole('link', { name: READINESS_COPY.addConnection })).toBeNull();
  });

  it('keeps the readiness column unsortable', () => {
    expect(find(columnsFor(), PROJECT_COLUMN.READINESS)).not.toHaveProperty('sorter');
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
