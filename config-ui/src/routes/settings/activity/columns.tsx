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

import { ACTIVITY_COLUMN, COPY } from './constants';
import type { ActivityRow } from './types';

export const getActivityColumns = (onOpen: (row: ActivityRow) => void): TableColumnsType<ActivityRow> => [
  { key: ACTIVITY_COLUMN.WHEN, title: COPY.columns.when, dataIndex: 'when' },
  {
    key: ACTIVITY_COLUMN.ACTION,
    title: COPY.columns.action,
    render: (_, row) => (
      <Button type="link" aria-label={COPY.openEvent(row.action, row.when)} onClick={() => onOpen(row)}>
        {row.action}
      </Button>
    ),
  },
  { key: ACTIVITY_COLUMN.ACTOR, title: COPY.columns.actor, dataIndex: 'actor' },
  { key: ACTIVITY_COLUMN.TARGET, title: COPY.columns.target, dataIndex: 'target' },
  { key: ACTIVITY_COLUMN.DETAIL, title: COPY.columns.detail, dataIndex: 'detail' },
];
