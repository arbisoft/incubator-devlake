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

import type { ITask } from '@/types';

import type { FILTER_PARAM, PIPELINE_COLUMN, STAGE_STATE, TASK_CELL } from './constants';

export type PipelineSortKey = typeof PIPELINE_COLUMN.STARTED_AT | typeof PIPELINE_COLUMN.COMPLETED_AT;

export type PipelineFilters = Record<(typeof FILTER_PARAM)[keyof typeof FILTER_PARAM], string>;

export type StageState = (typeof STAGE_STATE)[keyof typeof STAGE_STATE];

export type PipelineStage = { key: string; tasks: ITask[]; state: StageState };

export type TaskCell =
  | { kind: typeof TASK_CELL.PENDING | typeof TASK_CELL.FAILED | typeof TASK_CELL.CANCELLED }
  | { kind: typeof TASK_CELL.PROGRESS; finished: number; total: number; counted: boolean };
