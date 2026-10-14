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

import { Button, type TableColumnsType } from 'antd';

import type { OtelMetricBatchSummary } from '@/api/otel';
import { STATUS_BADGE_VARIANT, StatusBadge, formatDateTime } from '@/ui';
import { STATUS_TONE } from '@/ui/constants';

import { BATCH_COLUMN, COPY } from './constants';
import { BATCH_STATUS_TONE } from './tones';

export const getBatchColumns = (
  onViewPayload: (batch: OtelMetricBatchSummary) => void,
): TableColumnsType<OtelMetricBatchSummary> => [
  {
    key: BATCH_COLUMN.RECEIVED,
    title: COPY.health.columns.received,
    dataIndex: 'receivedAt',
    render: (value: string) => formatDateTime(value),
  },
  {
    key: BATCH_COLUMN.STATUS,
    title: COPY.health.columns.status,
    dataIndex: 'status',
    render: (value: string) => (
      <StatusBadge
        tone={BATCH_STATUS_TONE[value] ?? STATUS_TONE.NEUTRAL}
        label={COPY.health.batchStatus[value as keyof typeof COPY.health.batchStatus] ?? value}
        variant={STATUS_BADGE_VARIANT.DOT}
      />
    ),
  },
  {
    key: BATCH_COLUMN.DATAPOINTS,
    title: COPY.health.columns.datapoints,
    dataIndex: 'datapointCount',
    align: 'right',
  },
  {
    key: BATCH_COLUMN.ACTIONS,
    title: COPY.health.columns.actions,
    align: 'right',
    render: (_, batch) => (
      <Button
        size="small"
        aria-label={COPY.health.viewPayloadFor(formatDateTime(batch.receivedAt))}
        onClick={() => onViewPayload(batch)}
      >
        {COPY.health.viewPayload}
      </Button>
    ),
  },
];
