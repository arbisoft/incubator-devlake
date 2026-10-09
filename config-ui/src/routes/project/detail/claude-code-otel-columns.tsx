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

import type { OtelConnectionResponse } from '@/api/otel';
import { COPY as OTEL_COPY } from '@/routes/otel/constants';
import { CONNECTION_STATE_TONE } from '@/routes/otel/tones';
import { getOtelConnectionStatus } from '@/routes/otel/utils';
import { STATUS_BADGE_VARIANT, StatusBadge } from '@/ui';
import { STATUS_TONE } from '@/ui/constants';

import { COPY, OTEL_COLUMN } from './constants';

export const getClaudeCodeOtelProjectColumns = (onManage: () => void): TableColumnsType<OtelConnectionResponse> => [
  { key: OTEL_COLUMN.TEAM, title: COPY.otel.columns.team, dataIndex: ['connection', 'teamName'] },
  {
    key: OTEL_COLUMN.PLACEMENT,
    title: COPY.otel.columns.placement,
    render: (_, { projects }) =>
      projects.length > 1 ? (
        <StatusBadge
          tone={STATUS_TONE.INFO}
          label={COPY.otel.shared(projects.length)}
          variant={STATUS_BADGE_VARIANT.TEXT}
        />
      ) : (
        <StatusBadge tone={STATUS_TONE.NEUTRAL} label={COPY.otel.projectOnly} variant={STATUS_BADGE_VARIANT.DOT} />
      ),
  },
  {
    key: OTEL_COLUMN.STATUS,
    title: COPY.otel.columns.status,
    render: (_, record) => {
      const status = getOtelConnectionStatus(record);
      return (
        <StatusBadge
          tone={CONNECTION_STATE_TONE[status]}
          label={OTEL_COPY.state[status]}
          variant={STATUS_BADGE_VARIANT.DOT}
        />
      );
    },
  },
  {
    key: OTEL_COLUMN.ACTIONS,
    align: 'right',
    render: (_, { connection }) => (
      <Button aria-label={COPY.otel.manageFor(connection.teamName)} onClick={onManage}>
        {COPY.otel.manage}
      </Button>
    ),
  },
];
