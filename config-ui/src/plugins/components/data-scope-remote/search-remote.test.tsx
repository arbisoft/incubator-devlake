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

import { messageMock } from '@/ui/__tests__/mock-message';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';
import { SearchRemote } from './search-remote';

const api = vi.hoisted(() => ({ remote: vi.fn(), searchRemote: vi.fn() }));
const SEARCH_PLACEHOLDER = 'Search repositories';

vi.mock('@/api', () => ({ default: { scope: api } }));
vi.mock('ahooks', () => ({ useDebounce: (value: string) => value }));
vi.mock('@/plugins/utils', () => ({ getPluginScopeName: (_plugin: string, item: { name: string }) => item.name }));
vi.mock('./scope-panes', () => ({ ScopePanes: () => null }));
vi.mock('./selected-scopes', () => ({ SelectedScopes: () => null }));
vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

const setup = () =>
  renderWithTheme(
    <SearchRemote
      mode="multiple"
      plugin="github"
      connectionId={1}
      config={{ title: 'Repositories', searchPlaceholder: SEARCH_PLACEHOLDER }}
      disabledScope={[]}
      selectedScope={[]}
      onChange={vi.fn()}
    />,
  );

describe('SearchRemote request errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.remote.mockResolvedValue({ children: [] });
  });

  it.each([
    [401, COPY.authenticationFailed],
    [403, COPY.forbidden],
    [404, COPY.notFound],
  ])('shows safe, actionable feedback for HTTP %s', async (status, expectedMessage) => {
    api.searchRemote.mockRejectedValue({ response: { status, data: { message: 'raw server detail' } } });
    setup();

    fireEvent.change(screen.getByRole('textbox', { name: SEARCH_PLACEHOLDER }), {
      target: { value: 'owner/repository' },
    });

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith(expectedMessage));
    expect(messageMock.error).not.toHaveBeenCalledWith('raw server detail');
  });

  it('keeps a failed stale search silent', async () => {
    let rejectStaleSearch: ((reason?: unknown) => void) | undefined;
    api.searchRemote.mockImplementation((_plugin, _connectionId, { search }) => {
      if (search === 'old-query') {
        return new Promise((_resolve, reject) => {
          rejectStaleSearch = reject;
        });
      }
      return Promise.resolve({ children: [], count: 0 });
    });
    setup();

    const input = screen.getByRole('textbox', { name: SEARCH_PLACEHOLDER });
    fireEvent.change(input, { target: { value: 'old-query' } });
    await waitFor(() => expect(api.searchRemote).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: 'new-query' } });
    await waitFor(() => expect(api.searchRemote).toHaveBeenCalledTimes(2));

    rejectStaleSearch?.({ response: { status: 403 } });
    await waitFor(() => expect(api.searchRemote).toHaveBeenCalledTimes(2));
    expect(messageMock.error).not.toHaveBeenCalled();
  });
});
