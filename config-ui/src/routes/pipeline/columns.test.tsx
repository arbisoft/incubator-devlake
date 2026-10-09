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
import { describe, expect, it, vi } from 'vitest';

import { IPipelineStatus, type IPipeline } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { getPipelineColumns } from './columns';
import { COPY, PIPELINE_COLUMN, PIPELINE_ROW_ACTION } from './constants';

const PIPELINE = {
  id: 2169,
  name: 'Arbisoft Website-Blueprint',
  status: IPipelineStatus.COMPLETED,
  beganAt: '2026-06-06T16:00:00Z',
  finishedAt: '2026-06-06T16:05:00Z',
  finishedTasks: 3,
  totalTasks: 4,
} as IPipeline;

const find = (columns: TableColumnsType<IPipeline>, key: string) => columns.find((item) => item.key === key);

const renderCell = (key: string, onRowAction = vi.fn(), sortable = true) => {
  const col = find(getPipelineColumns({ sortable, onRowAction }), key);
  return renderWithTheme(<>{col && 'render' in col && col.render?.(undefined, PIPELINE, 0)}</>);
};

describe('pipeline columns', () => {
  it('sorts on started and completed when the table is sortable', () => {
    const sortable = getPipelineColumns({ sortable: true, onRowAction: vi.fn() })
      .filter((item) => 'sorter' in item && item.sorter)
      .map((item) => item.key);
    expect(sortable).toEqual([PIPELINE_COLUMN.STARTED_AT, PIPELINE_COLUMN.COMPLETED_AT]);
  });

  it('does not sort when the table is not sortable', () => {
    const columns = getPipelineColumns({ sortable: false, onRowAction: vi.fn() });
    expect(columns.some((item) => 'sorter' in item && item.sorter)).toBe(false);
  });

  it('shows the status as text with the task progress', () => {
    renderCell(PIPELINE_COLUMN.STATUS);
    expect(screen.getByText('Succeeded')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('reports the picked row action with its pipeline', () => {
    const onRowAction = vi.fn();
    renderCell(PIPELINE_COLUMN.ACTION, onRowAction);
    fireEvent.click(screen.getByRole('button', { name: COPY.rowActions.label(PIPELINE.id) }));
    fireEvent.click(screen.getByText(COPY.rowActions.configuration));
    expect(onRowAction).toHaveBeenCalledWith(
      PIPELINE_ROW_ACTION.CONFIGURATION,
      PIPELINE,
      screen.getByRole('button', { name: COPY.rowActions.label(PIPELINE.id) }),
    );
  });
});
