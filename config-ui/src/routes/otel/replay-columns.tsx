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

import { Typography, type TableColumnsType } from 'antd';

import type { OtelReplay } from '@/api/otel';
import { LAYOUT } from '@/theme/scales';
import { IdentityCell, STATUS_BADGE_VARIANT, StatusBadge, formatDateTime } from '@/ui';
import { COMMON_COPY, STATUS_TONE } from '@/ui/constants';

import { REPLAY_COLUMN, REPLAY_COPY } from './replay-constants';
import { REPLAY_STATE_TONE } from './tones';
import { formatReplayDays } from './utils';

export const getReplayColumns = (): TableColumnsType<OtelReplay> => [
  {
    key: REPLAY_COLUMN.REQUESTED,
    title: REPLAY_COPY.columns.requested,
    width: LAYOUT.otelReplayColumnWidth.requested,
    render: (_, { createdAt, requestedBy }) => (
      <IdentityCell primary={formatDateTime(createdAt)} secondary={requestedBy ?? COMMON_COPY.emptyValue} />
    ),
  },
  {
    key: REPLAY_COLUMN.REQUESTED_FOR,
    title: REPLAY_COPY.columns.requestedFor,
    width: LAYOUT.otelReplayColumnWidth.requestedFor,
    ellipsis: true,
    render: (_, { requestedForConnectionId, requestedForTeamName }) =>
      requestedForConnectionId === null ? (
        <StatusBadge tone={STATUS_TONE.NEUTRAL} label={REPLAY_COPY.manual} variant={STATUS_BADGE_VARIANT.TEXT} />
      ) : (
        requestedForTeamName
      ),
  },
  {
    key: REPLAY_COLUMN.DAYS,
    title: REPLAY_COPY.columns.days,
    width: LAYOUT.otelReplayColumnWidth.days,
    render: (_, { rangeStart, rangeEnd }) => formatReplayDays(rangeStart, rangeEnd),
  },
  {
    key: REPLAY_COLUMN.STATUS,
    title: REPLAY_COPY.columns.status,
    width: LAYOUT.otelReplayColumnWidth.status,
    dataIndex: 'state',
    render: (state: OtelReplay['state']) => (
      <StatusBadge
        tone={REPLAY_STATE_TONE[state]}
        label={REPLAY_COPY.state[state]}
        variant={STATUS_BADGE_VARIANT.DOT}
      />
    ),
  },
  {
    key: REPLAY_COLUMN.BATCHES,
    title: REPLAY_COPY.columns.batches,
    width: LAYOUT.otelReplayColumnWidth.batches,
    align: 'right',
    render: (_, { replayedBatches, skippedBatches }) => REPLAY_COPY.batches(replayedBatches, skippedBatches),
  },
  {
    key: REPLAY_COLUMN.ERROR,
    title: REPLAY_COPY.columns.error,
    width: LAYOUT.otelReplayColumnWidth.error,
    dataIndex: 'errorMessage',
    render: (value: string | null) =>
      value ? (
        <Typography.Text type="danger" ellipsis={{ tooltip: value }}>
          {value}
        </Typography.Text>
      ) : (
        COMMON_COPY.emptyValue
      ),
  },
];
