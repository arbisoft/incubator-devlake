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

import { describe, expect, it } from 'vitest';

import { OTEL_REPLAY_KIND, OTEL_REPLAY_STATE, OTEL_STATUS } from '@/api/otel/constants';
import type { OtelConnection, OtelReplay } from '@/api/otel/types';

import { REPLAY_COPY } from './replay-constants';
import {
  formatReplayDays,
  getOtelRebindError,
  getOtelReplayError,
  getRebindDefaults,
  getReplayDateLimits,
  getReplayQueuedMessage,
  includesToday,
  isOrganizationId,
  isReplayDayDisabled,
} from './utils';

const NOW = new Date('2026-10-19T22:30:00Z');
const LIMITS = { min: '2026-07-22', max: '2026-10-19' };
const ORGANIZATION_ID = '8f14e45f-ceea-4e0a-9f3a-0d2f9a1b2c3d';
const DAY_START = '2026-10-19T00:00:00Z';
const NEXT_DAY_START = '2026-10-20T00:00:00Z';
const MONTH_START = '2026-10-01T00:00:00Z';
const MONTH_FIRST_DAY = '2026-10-01';

const otelConnection = (overrides: Partial<OtelConnection> = {}): OtelConnection => ({
  id: 1,
  name: 'claude-platform',
  teamName: 'Platform',
  teamSlug: 'platform',
  collectorEndpoint: '',
  protocol: 'http',
  status: OTEL_STATUS.ACTIVE,
  organizationId: ORGANIZATION_ID,
  revokedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '',
  ...overrides,
});

const replayRequest = (
  state: OtelReplay['state'],
  kind: OtelReplay['kind'] = OTEL_REPLAY_KIND.METRICS,
): OtelReplay => ({
  id: 1,
  requestedForConnectionId: null,
  kind,
  rangeStart: DAY_START,
  rangeEnd: NEXT_DAY_START,
  state,
  replayedBatches: 0,
  skippedBatches: 0,
  errorMessage: null,
  requestedBy: null,
  createdAt: '',
  completedAt: null,
});

const httpError = (status: number) => ({ response: { status, data: { message: 'SELECT * FROM secrets' } } });

describe('routes/otel/utils replay helpers', () => {
  it('limits rebuild days to the UTC retention window', () => {
    expect(getReplayDateLimits(NOW)).toEqual(LIMITS);
    expect(getReplayDateLimits(new Date('2026-10-20T03:00:00+05:00'))).toEqual(LIMITS);
  });

  it('starts the window at the connection creation day when that is later', () => {
    expect(getReplayDateLimits(NOW, '2026-10-01T12:00:00Z').min).toBe(MONTH_FIRST_DAY);
    expect(getReplayDateLimits(NOW, '2026-01-01T00:00:00Z').min).toBe(LIMITS.min);
  });

  it('disables only days outside the limits', () => {
    expect(isReplayDayDisabled('2026-07-21', LIMITS)).toBe(true);
    expect(isReplayDayDisabled(LIMITS.min, LIMITS)).toBe(false);
    expect(isReplayDayDisabled(LIMITS.max, LIMITS)).toBe(false);
    expect(isReplayDayDisabled('2026-10-20', LIMITS)).toBe(true);
  });

  it('detects a range that includes today', () => {
    expect(includesToday({ startDate: MONTH_FIRST_DAY, endDate: LIMITS.max }, LIMITS)).toBe(true);
    expect(includesToday({ startDate: MONTH_FIRST_DAY, endDate: '2026-10-18' }, LIMITS)).toBe(false);
  });

  it('defaults the rebind rebuild from the connection state', () => {
    expect(getRebindDefaults(otelConnection(), NOW)).toEqual({
      rebuild: true,
      available: true,
      range: { startDate: LIMITS.min, endDate: LIMITS.max },
    });
    expect(getRebindDefaults(otelConnection({ organizationId: null }), NOW)).toMatchObject({
      rebuild: false,
      available: true,
    });
    expect(
      getRebindDefaults(otelConnection({ status: OTEL_STATUS.REVOKED, revokedAt: '2026-10-10T08:00:00Z' }), NOW).range,
    ).toEqual({ startDate: LIMITS.min, endDate: '2026-10-10' });
    expect(
      getRebindDefaults(otelConnection({ status: OTEL_STATUS.REVOKED, revokedAt: '2026-05-01T00:00:00Z' }), NOW),
    ).toMatchObject({ rebuild: false, available: false });
  });

  it('accepts only UUID organization IDs', () => {
    expect(isOrganizationId(`  ${ORGANIZATION_ID.toUpperCase()}  `)).toBe(true);
    expect(isOrganizationId('not-a-uuid')).toBe(false);
    expect(isOrganizationId('')).toBe(false);
  });

  it('formats the inclusive UTC days of a rebuild', () => {
    expect(formatReplayDays(DAY_START, NEXT_DAY_START)).toBe('2026-10-19');
    expect(formatReplayDays(MONTH_START, NEXT_DAY_START)).toBe(`${MONTH_FIRST_DAY} – ${LIMITS.max}`);
  });

  it('summarises a queued rebuild', () => {
    const pending = replayRequest(OTEL_REPLAY_STATE.PENDING);
    const waiting = replayRequest(OTEL_REPLAY_STATE.WAITING);

    expect(getReplayQueuedMessage({ queued: [pending], reused: [] })).toBe('Rebuild queued.');
    expect(getReplayQueuedMessage({ queued: [pending], reused: [pending, pending] })).toBe(
      'Rebuild queued. 2 requests already pending covered some days.',
    );
    expect(getReplayQueuedMessage({ queued: [pending], reused: [waiting] })).toBe(
      'Rebuild queued. 1 request already pending covered some days. Today rebuilds after midnight UTC.',
    );
    expect(getReplayQueuedMessage({ queued: [], reused: [pending] })).toBe(
      'Already queued. 1 request already pending covered some days.',
    );
  });

  it('counts both kinds of a queued rebuild and waits only for metrics', () => {
    const metrics = replayRequest(OTEL_REPLAY_STATE.WAITING);
    const logs = replayRequest(OTEL_REPLAY_STATE.PENDING, OTEL_REPLAY_KIND.LOGS);

    expect(getReplayQueuedMessage({ queued: [metrics, logs], reused: [] })).toBe(REPLAY_COPY.queued(2, 0, true));
    expect(getReplayQueuedMessage({ queued: [logs], reused: [] })).toBe(REPLAY_COPY.queued(1, 0, false));
  });

  it('maps rebind and rebuild failures to safe copy', () => {
    expect(getOtelRebindError(httpError(400))).toBe(REPLAY_COPY.errors.rebind);
    expect(getOtelRebindError(httpError(404))).toBe(REPLAY_COPY.errors.connectionMissing);
    expect(getOtelRebindError(new Error('network error'))).toBe(REPLAY_COPY.errors.rebindFailed);
    expect(getOtelReplayError(httpError(400))).toBe(REPLAY_COPY.errors.replay);
    expect(getOtelReplayError(new Error('network error'))).toBe(REPLAY_COPY.errors.replayFailed);
  });
});
