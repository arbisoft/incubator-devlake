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
import { describe, expect, it, vi } from 'vitest';

import { OTEL_BATCH_STATUS, OTEL_INGESTION_STATE, type OtelIngestionStatus } from '@/api/otel';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';
import { OtelIngestionHealth } from './ingestion-health';
import { REPLAY_COPY } from './replay-constants';
import type { OtelIngestionHealthProps } from './types';

const status: OtelIngestionStatus = {
  contractVersion: 1,
  state: OTEL_INGESTION_STATE.HEALTHY,
  reasons: [],
  batchCounts: { [OTEL_BATCH_STATUS.PENDING]: 2, [OTEL_BATCH_STATUS.RETRYABLE_ERROR]: 1 },
  oldestNonterminal: { receivedAt: '2026-10-15T00:00:00Z', ageSeconds: 120 },
  recentPermanentErrors: 0,
  permanentErrorReasons: [],
  recentBatches: [
    {
      id: 1,
      receivedAt: '2026-10-15T00:00:00Z',
      status: OTEL_BATCH_STATUS.PROCESSED,
      resourceCount: 1,
      datapointCount: 4,
    },
  ],
};

const renderHealth = (props: OtelIngestionHealthProps) => renderWithTheme(<OtelIngestionHealth {...props} />);

describe('OtelIngestionHealth', () => {
  it('shows a retryable unavailable state instead of claiming no batches after initial failure', () => {
    const onRetry = vi.fn();
    renderHealth({ loading: true, failed: true, onRetry });

    expect(screen.getByText(COPY.health.batchesUnavailable)).toBeTruthy();
    expect(screen.queryByText(COPY.health.emptyBatches.title)).toBeNull();
    const retryButtons = screen.getAllByRole('button', { name: COPY.health.retry });
    expect(retryButtons).toHaveLength(2);
    fireEvent.click(retryButtons[1]);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the no-batches message for a successful empty response', () => {
    renderHealth({
      loading: false,
      failed: false,
      status: { ...status, recentBatches: [] },
      onRetry: vi.fn(),
    });

    expect(screen.getByText(COPY.health.emptyBatches.title)).toBeTruthy();
    expect(screen.queryByText(COPY.health.batchesUnavailable)).toBeNull();
  });

  it('keeps the last loaded health metrics and batches visible during a refresh failure', () => {
    renderHealth({ loading: true, failed: true, status, onRetry: vi.fn() });

    expect(screen.getByText(COPY.health.state[OTEL_INGESTION_STATE.HEALTHY])).toBeTruthy();
    expect(screen.getByText(COPY.health.batchStatus[OTEL_BATCH_STATUS.PROCESSED])).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows the log queue metrics when the status reports them', () => {
    renderHealth({
      loading: false,
      failed: false,
      status: {
        ...status,
        logs: {
          batchCounts: { [OTEL_BATCH_STATUS.REPLAY_PENDING]: 7 },
          recentPermanentErrors: 0,
          permanentErrorReasons: [],
        },
      },
      onRetry: vi.fn(),
    });

    expect(screen.getByText(COPY.health.metrics.logReplaying)).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('hides the log queue metrics when the status has none', () => {
    renderHealth({ loading: false, failed: false, status, onRetry: vi.fn() });

    expect(screen.queryByText(COPY.health.metrics.logPending)).toBeNull();
  });

  it('shows the rebuilding notice only while a rebuild is active', () => {
    const activeReplay = {
      id: 9,
      requestedForTeamName: 'Platform',
      rangeStart: '2026-10-18T00:00:00Z',
      rangeEnd: '2026-10-20T00:00:00Z',
    };
    const { rerender } = renderHealth({ loading: false, failed: false, status, onRetry: vi.fn() });
    expect(screen.queryByText(/Rebuilding/)).toBeNull();

    rerender(
      <OtelIngestionHealth loading={false} failed={false} status={{ ...status, activeReplay }} onRetry={vi.fn()} />,
    );

    expect(screen.getByText(REPLAY_COPY.rebuilding('2026-10-18 – 2026-10-19', 'Platform'))).toBeTruthy();
  });
});
