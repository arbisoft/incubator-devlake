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

import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { getClaudeCodeOtelProjectColumns } from './claude-code-otel-columns';
import { COPY, OTEL_COLUMN } from './constants';

const record = (overrides: Partial<OtelConnectionResponse> = {}, status = OTEL_STATUS.ACTIVE) =>
  ({
    connection: { id: 1, teamName: 'Platform', status },
    credentials: [],
    restartRequired: false,
    recoveryRequired: false,
    storageNeedsApplying: false,
    projects: [{ name: 'a' }],
    ...overrides,
  }) as OtelConnectionResponse;

const cell = (columns: TableColumnsType<OtelConnectionResponse>, key: string, row: OtelConnectionResponse) => {
  const column = columns.find((item) => item.key === key);
  return renderWithTheme(<>{column && 'render' in column && column.render?.(undefined, row, 0)}</>);
};

describe('Claude Code OTel project columns', () => {
  const columns = getClaudeCodeOtelProjectColumns(vi.fn());

  it('says whether the team is shared across projects', () => {
    cell(columns, OTEL_COLUMN.PLACEMENT, record({ projects: [{ name: 'a' }, { name: 'b' }] }));
    expect(screen.getByText(COPY.otel.shared(2))).toBeTruthy();
  });

  it('marks a project-only placement', () => {
    cell(columns, OTEL_COLUMN.PLACEMENT, record());
    expect(screen.getByText(COPY.otel.projectOnly)).toBeTruthy();
  });

  it('shows the connection status as text', () => {
    cell(columns, OTEL_COLUMN.STATUS, record({ restartRequired: true }));
    expect(screen.getByText('Action required')).toBeTruthy();
  });

  it('opens the Claude Code OTel page from the manage button, named for its team', () => {
    const onManage = vi.fn();
    cell(getClaudeCodeOtelProjectColumns(onManage), OTEL_COLUMN.ACTIONS, record());
    fireEvent.click(screen.getByRole('button', { name: COPY.otel.manageFor('Platform') }));
    expect(onManage).toHaveBeenCalledOnce();
  });
});
