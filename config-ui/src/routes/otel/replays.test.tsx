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
import { OTEL_REPLAY_KIND, OTEL_REPLAY_STATE, type OtelReplay } from '@/api/otel';
import { COMMON_COPY } from '@/ui';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { REPLAY_COPY } from './replay-constants';
import { OtelReplays } from './replays';

vi.mock('@/api', () => ({ default: { otel: { listReplays: vi.fn(), createReplay: vi.fn() } } }));

const otel = vi.mocked(API.otel);

const replay = (overrides: Partial<OtelReplay>): OtelReplay => ({
  id: 1,
  requestedForConnectionId: null,
  requestedForTeamName: null,
  kind: OTEL_REPLAY_KIND.METRICS,
  rangeStart: '2026-10-19T00:00:00Z',
  rangeEnd: '2026-10-20T00:00:00Z',
  state: OTEL_REPLAY_STATE.WAITING,
  replayedBatches: 3,
  skippedBatches: 1,
  errorMessage: null,
  requestedBy: 'admin@example.com',
  createdAt: '2026-10-19T08:00:00Z',
  completedAt: null,
  ...overrides,
});

const MULTI_DAY_RANGE = '2026-10-01 – 2026-10-19';

const ROWS = [
  replay({ id: 1 }),
  replay({
    id: 2,
    requestedForConnectionId: 5,
    requestedForTeamName: 'Platform',
    rangeStart: '2026-10-01T00:00:00Z',
    state: OTEL_REPLAY_STATE.FAILED,
    errorMessage: 'converter failed',
  }),
  replay({ id: 3, kind: OTEL_REPLAY_KIND.LOGS, state: OTEL_REPLAY_STATE.COMPLETED, requestedBy: null }),
];

describe('OtelReplays', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists rebuild requests without a requested-for column', async () => {
    otel.listReplays.mockResolvedValue({ replays: ROWS, count: ROWS.length });
    renderWithTheme(<OtelReplays version={0} />);

    expect(await screen.findByText(MULTI_DAY_RANGE)).toBeTruthy();
    expect(screen.getByRole('table', { name: REPLAY_COPY.tableLabel }).style.tableLayout).toBe('fixed');
    expect(screen.queryByRole('columnheader', { name: 'Requested for' })).toBeNull();
    expect(screen.queryByText('Manual', { exact: true })).toBeNull();
    expect(screen.queryByText('Platform', { exact: true })).toBeNull();
    expect(screen.getAllByText('2026-10-19')).toHaveLength(2);
    expect(screen.getByText(MULTI_DAY_RANGE)).toBeTruthy();
    expect(screen.getByText(REPLAY_COPY.state[OTEL_REPLAY_STATE.WAITING])).toBeTruthy();
    expect(screen.getByText(REPLAY_COPY.state[OTEL_REPLAY_STATE.FAILED])).toBeTruthy();
    expect(screen.getByText(REPLAY_COPY.state[OTEL_REPLAY_STATE.COMPLETED])).toBeTruthy();
    expect(screen.getAllByText(REPLAY_COPY.batches(3, 1))).toHaveLength(ROWS.length);
    expect(screen.getByText('converter failed')).toBeTruthy();
    expect(screen.getAllByText(REPLAY_COPY.kind[OTEL_REPLAY_KIND.METRICS])).toHaveLength(2);
    expect(screen.getAllByText(REPLAY_COPY.kind[OTEL_REPLAY_KIND.LOGS])).toHaveLength(1);
  });

  it('requests the next server page when the page changes', async () => {
    otel.listReplays.mockResolvedValue({ replays: ROWS, count: 25 });
    renderWithTheme(<OtelReplays version={0} />);
    await screen.findByText(MULTI_DAY_RANGE);
    expect(otel.listReplays).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }, expect.anything());

    fireEvent.click(screen.getByTitle('2'));

    await waitFor(() =>
      expect(otel.listReplays).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 }, expect.anything()),
    );
  });

  it('shows the empty state when nothing was requested', async () => {
    otel.listReplays.mockResolvedValue({ replays: [], count: 0 });
    renderWithTheme(<OtelReplays version={0} />);

    expect(await screen.findByText(REPLAY_COPY.empty.title)).toBeTruthy();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    otel.listReplays.mockRejectedValueOnce(new Error('network error'));
    otel.listReplays.mockResolvedValueOnce({ replays: ROWS, count: ROWS.length });
    renderWithTheme(<OtelReplays version={0} />);

    expect(await screen.findByText(REPLAY_COPY.unavailable)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.retry }));

    expect(await screen.findByText(MULTI_DAY_RANGE)).toBeTruthy();
    expect(otel.listReplays).toHaveBeenCalledTimes(2);
  });
});
