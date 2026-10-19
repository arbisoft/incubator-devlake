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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IConnectionStatus, type IConnection } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { Connection } from './connection';

const mocks = vi.hoisted(() => ({
  connection: undefined as IConnection | undefined,
  navigate: vi.fn(),
  list: {
    page: 1,
    pageSize: 20,
    keyword: '',
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    setKeyword: vi.fn(),
  },
  rows: [{ id: 'repo-1', name: 'org/repo', projects: [] as string[] }],
  selection: { selectedIds: [] as ID[], onChange: vi.fn(), clear: vi.fn() },
  bulk: {
    state: { open: false, running: false, total: 0, completed: 0, outcomes: [] },
    close: vi.fn(),
    reset: vi.fn(),
    start: vi.fn(),
  },
  flow: { confirmProps: {}, conflictOpen: false, conflict: undefined, request: vi.fn(), closeConflict: vi.fn() },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ plugin: 'github', id: '3' }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/features/connections', () => ({
  selectConnection: () => undefined,
  useHealthChecks: () => ({ check: vi.fn() }),
}));

vi.mock('@/hooks', () => ({ useAppSelector: () => mocks.connection }));

vi.mock('@/plugins', () => ({
  ConnectionStatus: () => null,
  getPluginConfig: () => ({ scopeConfig: true }),
}));

vi.mock('@/ui', () => ({
  ConfirmModal: () => null,
  ListPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  ListToolbar: ({ end }: { end: React.ReactNode }) => <div>{end}</div>,
  PageHeader: ({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </header>
  ),
  buildListEmpty: () => ({}),
}));

vi.mock('./scope-table', () => ({
  ScopeTable: () => <div data-testid="scope-table" />,
  selectedScopes: () => [],
  useScopeSelection: () => mocks.selection,
}));

vi.mock('./modals', () => ({
  AddDataScopeModal: () => null,
  AssociateScopeConfigModal: () => null,
  BulkDeleteModal: () => null,
  ConflictModal: () => null,
}));

vi.mock('./use-scope-list', () => ({
  useScopeList: () => ({
    list: mocks.list,
    rows: mocks.rows,
    total: mocks.rows.length,
    ready: true,
    failed: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('./use-associate-scope-config', () => ({ useAssociateScopeConfig: () => vi.fn() }));
vi.mock('./use-bulk-delete', () => ({ useBulkDelete: () => mocks.bulk }));
vi.mock('./use-delete-flow', () => ({ useDeleteFlow: () => mocks.flow }));

describe('Connection details page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection = undefined;
  });

  it('shows a recoverable missing-connection state and navigates back', () => {
    renderWithTheme(<Connection />);

    expect(screen.getByRole('heading', { name: 'Connection not found' })).toBeTruthy();
    expect(screen.getByText('This connection may have been removed.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to connections' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/connections');
  });

  it('keeps the connection table actions when the store entry is present', () => {
    mocks.connection = {
      unique: 'github-3',
      plugin: 'github',
      pluginName: 'GitHub',
      id: 3,
      name: 'GitHub connection',
      status: IConnectionStatus.IDLE,
      endpoint: '',
      proxy: '',
    };
    renderWithTheme(<Connection />);

    expect(screen.getByRole('heading', { name: 'GitHub connection' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete connection/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete data scope/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add data scope/ })).toBeTruthy();
    expect(screen.getByTestId('scope-table')).toBeTruthy();
  });
});
