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

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { REQUEST_DELAY_MS } from '@/hooks/use-refresh-data/constants';
import type { DataScopeRemoteModalProps } from '@/plugins/components/data-scope-remote/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { SCOPE_MEMBERSHIP_PAGE_SIZE } from '../constants';

import { AddDataScopeModal } from './add-data-scope-modal';

vi.mock('@/api', () => ({ default: { scope: { list: vi.fn() } } }));

vi.mock('@/plugins', () => ({
  DataScopeRemoteModal: ({
    disabledScope,
    loadingScopes,
    scopesLoadFailed,
    onRetryScopes,
    onCancel,
  }: DataScopeRemoteModalProps) => (
    <div>
      <span data-testid="loading-membership">{String(loadingScopes)}</span>
      <span data-testid={FAILED_MEMBERSHIP_TEST_ID}>{String(scopesLoadFailed)}</span>
      <span data-testid={MEMBERSHIP_IDS_TEST_ID}>{disabledScope?.map(({ id }) => String(id)).join(',')}</span>
      <button type="button" onClick={onRetryScopes}>
        Retry membership
      </button>
      <button type="button" onClick={onCancel}>
        Close membership
      </button>
    </div>
  ),
}));

const list = vi.mocked(API.scope.list);
const CONNECTION_ID = 9;
const CONNECTION_NAME = 'GitHub connection';
const PLUGIN = 'github';
const FAILED_MEMBERSHIP_TEST_ID = 'failed-membership';
const FALSE_TEXT = String(false);
const MEMBERSHIP_IDS_TEST_ID = 'membership-ids';
const TRUE_TEXT = String(true);

const scopePage = (start: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    scope: { githubId: start + index, name: `repo-${start + index}`, fullName: `org/repo-${start + index}` },
  }));

const renderModal = (open: boolean) =>
  renderWithTheme(
    <AddDataScopeModal
      open={open}
      plugin={PLUGIN}
      connectionId={CONNECTION_ID}
      connectionName={CONNECTION_NAME}
      onClose={vi.fn()}
      onAdded={vi.fn()}
    />,
  );

describe('AddDataScopeModal membership loading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads every membership page even when the table page is narrower', async () => {
    list
      .mockResolvedValueOnce({
        count: SCOPE_MEMBERSHIP_PAGE_SIZE + 1,
        scopes: scopePage(1, SCOPE_MEMBERSHIP_PAGE_SIZE),
      })
      .mockResolvedValueOnce({ count: SCOPE_MEMBERSHIP_PAGE_SIZE + 1, scopes: scopePage(101, 1) });
    renderModal(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('loading-membership').textContent).toBe(FALSE_TEXT);
    expect(screen.getByTestId(FAILED_MEMBERSHIP_TEST_ID).textContent).toBe(FALSE_TEXT);
    expect(screen.getByTestId(MEMBERSHIP_IDS_TEST_ID).textContent?.split(',')).toHaveLength(
      SCOPE_MEMBERSHIP_PAGE_SIZE + 1,
    );
    expect(screen.getByTestId(MEMBERSHIP_IDS_TEST_ID).textContent).toContain('101');
  });

  it('keeps the dialog blocked after a page fails and retry replaces partial membership', async () => {
    list
      .mockResolvedValueOnce({
        count: SCOPE_MEMBERSHIP_PAGE_SIZE + 1,
        scopes: scopePage(1, SCOPE_MEMBERSHIP_PAGE_SIZE),
      })
      .mockRejectedValueOnce(new Error('fixed safe failure'))
      .mockResolvedValueOnce({ count: 1, scopes: scopePage(101, 1) });
    renderModal(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });
    expect(screen.getByTestId(FAILED_MEMBERSHIP_TEST_ID).textContent).toBe(TRUE_TEXT);
    expect(screen.getByTestId(MEMBERSHIP_IDS_TEST_ID).textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Retry membership' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });
    expect(screen.getByTestId(FAILED_MEMBERSHIP_TEST_ID).textContent).toBe(FALSE_TEXT);
    expect(screen.getByTestId(MEMBERSHIP_IDS_TEST_ID).textContent).toBe('101');
  });

  it('aborts an in-flight membership request when the dialog closes', async () => {
    let signal: AbortSignal | undefined;
    let complete: ((result: { count: number; scopes: [] }) => void) | undefined;
    list.mockImplementation((_plugin, _connectionId, _params, requestSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const { rerender } = renderModal(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
    });
    rerender(
      <AddDataScopeModal
        open={false}
        plugin={PLUGIN}
        connectionId={CONNECTION_ID}
        connectionName={CONNECTION_NAME}
        onClose={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    expect(signal?.aborted).toBe(true);
    await act(async () => {
      complete?.({ count: 0, scopes: [] });
      await Promise.resolve();
    });
  });
});
