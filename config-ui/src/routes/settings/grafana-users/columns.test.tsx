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
import { Table } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import { GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { getGrafanaUserColumns } from './columns';
import { COPY, GRAFANA_ROW_ACTION, GRAFANA_USER_COLUMN } from './constants';
import type { GrafanaColumnActions } from './types';

const EMAIL = 'ann@example.com';

const user = (patch: Partial<GrafanaUser> = {}): GrafanaUser => ({
  id: 1,
  email: EMAIL,
  name: 'Ann',
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: ['alpha'],
  ...patch,
});

const makeActions = (): GrafanaColumnActions => ({
  onRoleChange: vi.fn(),
  onToggle: vi.fn(),
  onRemove: vi.fn(),
  onEditProjects: vi.fn(),
  onMenuAction: vi.fn(),
});

const setup = (row: GrafanaUser) => {
  const actions = makeActions();
  const columns = getGrafanaUserColumns(actions);
  renderWithTheme(<Table rowKey="id" pagination={false} columns={columns} dataSource={[row]} />);
  return actions;
};

describe('Grafana user columns', () => {
  it('lists the columns in order', () => {
    const columns = getGrafanaUserColumns(makeActions());
    expect(columns.map((column) => column.key)).toEqual([
      GRAFANA_USER_COLUMN.USER,
      GRAFANA_USER_COLUMN.ROLE,
      GRAFANA_USER_COLUMN.PROJECTS,
      GRAFANA_USER_COLUMN.STATUS,
      GRAFANA_USER_COLUMN.ACTIONS,
    ]);
  });

  it('gives a normal account every action, each named after the account', async () => {
    const actions = setup(user());
    const role = screen.getByRole('combobox', { name: COPY.actions.roleFor(EMAIL) });
    fireEvent.mouseDown(role);
    fireEvent.click(await screen.findByTitle(GRAFANA_ROLE.EDITOR));
    expect(actions.onRoleChange).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), GRAFANA_ROLE.EDITOR);
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.editProjectsFor(EMAIL) }));
    expect(actions.onEditProjects).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.disableFor(EMAIL) }));
    expect(actions.onToggle).toHaveBeenCalledWith(GRAFANA_ROW_ACTION.DISABLE, expect.objectContaining({ id: 1 }));
    expect(screen.getByRole('button', { name: COPY.actions.moreFor(EMAIL) })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.deleteFor(EMAIL) }));
    expect(actions.onRemove).toHaveBeenCalled();
  });

  it('offers Enable for a disabled account', () => {
    const actions = setup(user({ disabled: true }));
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.enableFor(EMAIL) }));
    expect(actions.onToggle).toHaveBeenCalledWith(GRAFANA_ROW_ACTION.ENABLE, expect.objectContaining({ id: 1 }));
  });

  it('locks the role of a protected account and hides its toggle, menu and delete', () => {
    setup(user({ protected: true }));
    expect((screen.getByRole('combobox', { name: COPY.actions.roleFor(EMAIL) }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: COPY.actions.disableFor(EMAIL) })).toBeNull();
    expect(screen.queryByRole('button', { name: COPY.actions.moreFor(EMAIL) })).toBeNull();
    expect(screen.queryByRole('button', { name: COPY.actions.deleteFor(EMAIL) })).toBeNull();
    expect(screen.getByRole('button', { name: COPY.actions.editProjectsFor(EMAIL) })).toBeTruthy();
  });

  it('keeps the actions of an SSO account, marked as SSO', () => {
    setup(user({ sso: true }));
    expect(screen.getByRole('img', { name: COPY.sso.label })).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.actions.moreFor(EMAIL) })).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.actions.deleteFor(EMAIL) })).toBeTruthy();
  });

  it('shows a role outside Viewer, Editor and Admin as text', () => {
    setup(user({ role: 'None' }));
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: COPY.actions.roleFor(EMAIL) })).toBeNull();
  });
});
