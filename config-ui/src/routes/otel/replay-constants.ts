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

import { HttpStatusCode } from 'axios';

import { OTEL_REPLAY_KIND, OTEL_REPLAY_STATE } from '@/api/otel/constants';
import type { OtelReplayKind } from '@/api/otel/types';
import { formatPlural } from '@/utils/text';

export const REPLAY_DAY_FORMAT = 'YYYY-MM-DD';
export const REPLAY_MAX_LOOKBACK_DAYS = 89;
export const ORGANIZATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REPLAY_COLUMN = {
  REQUESTED: 'requested',
  DAYS: 'days',
  STATUS: 'status',
  BATCHES: 'batches',
  ERROR: 'error',
} as const;

export const REPLAY_COPY = {
  rebindAction: (name: string) => `Change organization for ${name}`,
  title: 'Data rebuilds',
  description:
    "Rebuilds recompute every team's metrics, prompts and events for the chosen UTC days from retained telemetry.",
  rebuild: 'Rebuild data',
  tableLabel: 'Data rebuild requests',
  unavailable: 'Data rebuilds could not be loaded.',
  empty: {
    title: 'No data rebuilds yet',
    description: 'Rebuilds appear here when an organization changes or someone rebuilds data.',
  },
  columns: {
    requested: 'Requested',
    days: 'Days (UTC)',
    status: 'Status',
    batches: 'Replayed / skipped',
    error: 'Error',
  },
  batches: (replayed: number, skipped: number) => `${replayed} / ${skipped}`,
  kind: {
    [OTEL_REPLAY_KIND.METRICS]: 'Metrics',
    [OTEL_REPLAY_KIND.LOGS]: 'Prompts and events',
  } satisfies Record<OtelReplayKind, string>,
  state: {
    [OTEL_REPLAY_STATE.PENDING]: 'Pending',
    [OTEL_REPLAY_STATE.WAITING]: 'Waiting for end of day',
    [OTEL_REPLAY_STATE.PROCESSING]: 'Processing',
    [OTEL_REPLAY_STATE.COMPLETED]: 'Completed',
    [OTEL_REPLAY_STATE.FAILED]: 'Failed',
  },
  queued: (queued: number, reused: number, waiting: boolean) =>
    [
      queued === 0 ? 'Already queued.' : 'Rebuild queued.',
      reused > 0 && `${formatPlural(reused, 'request')} already pending covered some days.`,
      waiting && 'Today rebuilds after midnight UTC.',
    ]
      .filter(Boolean)
      .join(' '),
  rebuilding: (kind: OtelReplayKind, days: string, team: string | null) => {
    const requester = team ? `requested for ${team}` : 'requested manually';
    const what = REPLAY_COPY.kind[kind].toLowerCase();
    return `Rebuilding ${what} for ${days} (UTC), ${requester}. New telemetry appears once it finishes.`;
  },
  errors: {
    rebind: 'Check the organization ID and the days to rebuild, then try again.',
    replay: 'Pick days within the last 90 days, up to today (UTC).',
    connectionMissing: 'This connection no longer exists. Refresh the page.',
    rebindFailed: 'Unable to change the organization. Please try again.',
    replayFailed: 'Unable to queue the rebuild. Please try again.',
  },
};

export const REBIND_ERROR_MAP: Record<string, string> = {
  [HttpStatusCode.BadRequest]: REPLAY_COPY.errors.rebind,
  [HttpStatusCode.NotFound]: REPLAY_COPY.errors.connectionMissing,
};

export const REPLAY_ERROR_MAP: Record<string, string> = {
  [HttpStatusCode.BadRequest]: REPLAY_COPY.errors.replay,
  [HttpStatusCode.NotFound]: REPLAY_COPY.errors.connectionMissing,
};
