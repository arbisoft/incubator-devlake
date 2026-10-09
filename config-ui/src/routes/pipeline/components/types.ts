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

import type { IPipeline, IPipelineStatus, ITask } from '@/types';
import type { DataTableProps } from '@/ui';

import type { PIPELINE_ROW_ACTION } from '../constants';
import type { PipelineSortKey, PipelineStage } from '../types';

export type PipelineRowAction = (typeof PIPELINE_ROW_ACTION)[keyof typeof PIPELINE_ROW_ACTION];

export type PipelineStatusCellProps = { status: IPipelineStatus; finished: number; total: number };

export type PipelineRowActionsProps = {
  id: ID;
  onSelect: (action: PipelineRowAction, trigger: HTMLElement | null) => void;
};

export type PipelineConfigDrawerProps = {
  open: boolean;
  id: ID;
  config: unknown;
  onClose: () => void;
};

export type PipelineTableProps = Pick<DataTableProps<IPipeline, PipelineSortKey>, 'list' | 'total'> & {
  empty?: DataTableProps<IPipeline, PipelineSortKey>['empty'];
  loading: boolean;
  dataSource: IPipeline[];
  pagination?: DataTableProps<IPipeline, PipelineSortKey>['pagination'];
};

export type PipelinePanelProps = { id: ID };

export type PipelineSummaryProps = { pipeline: IPipeline; onChanged: () => void };

export type PipelineStagesProps = { tasks: ITask[]; onChanged: () => void };

export type PipelineStageProps = { stage: PipelineStage; onChanged: () => void };

export type PipelineTaskProps = { task: ITask; onChanged: () => void };

export type PipelineDetailModalProps = { open: boolean; id: ID; onClose: () => void; afterClose?: () => void };
