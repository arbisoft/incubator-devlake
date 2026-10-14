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

import type { TableColumnsType } from 'antd';

import type { IPipeline } from '@/types';
import { formatTime } from '@/utils';

import { PipelineDuration } from './components/duration';
import { PipelineRowActions } from './components/row-actions';
import { PipelineStatusCell } from './components/status-cell';
import type { PipelineRowAction } from './components/types';
import { COPY, PIPELINE_COLUMN } from './constants';

type ColumnOptions = {
  sortable: boolean;
  onRowAction: (action: PipelineRowAction, pipeline: IPipeline, trigger: HTMLElement | null) => void;
};

export const getPipelineColumns = ({ sortable, onRowAction }: ColumnOptions): TableColumnsType<IPipeline> => [
  { key: PIPELINE_COLUMN.ID, title: COPY.columns.id, dataIndex: 'id' },
  { key: PIPELINE_COLUMN.BLUEPRINT, title: COPY.columns.blueprint, dataIndex: 'name' },
  {
    key: PIPELINE_COLUMN.STATUS,
    title: COPY.columns.status,
    render: (_, { status, finishedTasks, totalTasks }) => (
      <PipelineStatusCell status={status} finished={finishedTasks} total={totalTasks} />
    ),
  },
  {
    key: PIPELINE_COLUMN.STARTED_AT,
    title: COPY.columns.startedAt,
    dataIndex: 'beganAt',
    sorter: sortable,
    render: (beganAt: string | null) => formatTime(beganAt),
  },
  {
    key: PIPELINE_COLUMN.COMPLETED_AT,
    title: COPY.columns.completedAt,
    dataIndex: 'finishedAt',
    sorter: sortable,
    render: (finishedAt: string | null) => formatTime(finishedAt),
  },
  {
    key: PIPELINE_COLUMN.DURATION,
    title: COPY.columns.duration,
    render: (_, { status, beganAt, finishedAt }) => (
      <PipelineDuration status={status} beganAt={beganAt} finishedAt={finishedAt} />
    ),
  },
  {
    key: PIPELINE_COLUMN.ACTION,
    title: COPY.columns.action,
    align: 'center',
    render: (_, pipeline) => (
      <PipelineRowActions id={pipeline.id} onSelect={(action, trigger) => onRowAction(action, pipeline, trigger)} />
    ),
  },
];
