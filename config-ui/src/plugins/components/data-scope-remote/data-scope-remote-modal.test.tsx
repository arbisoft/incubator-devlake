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

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';
import { DataScopeRemoteModal } from './data-scope-remote-modal';
import type { DataScopeRemoteProps } from './types';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

vi.mock('@/api', () => ({ default: { scope: { batch: vi.fn() } } }));
vi.mock('@/plugins/utils', () => ({ getPluginConfig: () => ({ icon: () => null }) }));

vi.mock('./data-scope-remote', () => ({
  DataScopeRemote: ({ onChangeSelectedScope }: DataScopeRemoteProps) => (
    <button
      onClick={() =>
        onChangeSelectedScope([
          { id: 'a', data: { name: 'a' }, title: 'a', name: 'a', fullName: 'o/a', type: 'scope', parentId: null },
        ])
      }
    >
      pick
    </button>
  ),
}));

const batch = vi.mocked(API.scope.batch);
const TITLE = 'Add Data Scope: conn';

const setup = () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithTheme(
    <DataScopeRemoteModal
      open
      plugin="github"
      connectionId={1}
      title={TITLE}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onCancel };
};

describe('DataScopeRemoteModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is named by its title and cannot save before a scope is picked', () => {
    const { onSubmit } = setup();
    expect(screen.getByRole('dialog', { name: TITLE })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COPY.submit }));
    expect(batch).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves the data of the picked scopes and reports success', async () => {
    batch.mockResolvedValue({});
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'pick' }));
    fireEvent.click(screen.getByRole('button', { name: COPY.submit }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(batch).toHaveBeenCalledWith('github', 1, { data: [{ name: 'a' }] });
  });

  it('stays open when the save fails', async () => {
    batch.mockRejectedValue({ response: { status: 400, data: { message: 'raw' } } });
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'pick' }));
    fireEvent.click(screen.getByRole('button', { name: COPY.submit }));
    await waitFor(() => expect(batch).toHaveBeenCalledOnce());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
