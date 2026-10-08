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

import { groupBy, pick, sortBy } from 'lodash';

import type { ListParams } from '@/api/pipeline';
import { type IBlueprint, type IPipeline, IPipelineStatus, type ITask } from '@/types';
import type { ListQuery } from '@/ui';

import { PICKED_CONFIG_FIELDS, STAGE_STATE, TASK_CELL } from './constants';
import type { PipelineFilters, PipelineSortKey, PipelineStage, StageState, TaskCell } from './types';

const { ACTIVE, RUNNING, RERUN, CREATED, PENDING, COMPLETED, PARTIAL, FAILED, CANCELLED } = IPipelineStatus;

const RUNNING_STATUSES = [ACTIVE, RUNNING, RERUN];
const FINISHED_STATUSES = [COMPLETED, PARTIAL, FAILED, CANCELLED];
const RERUNNABLE_STATUSES = [PARTIAL, FAILED, CANCELLED];
const TASK_SETTLED_STATUSES = [COMPLETED, FAILED, CANCELLED];

export const isPipelineFinished = (status: IPipelineStatus) => FINISHED_STATUSES.includes(status);

export const areTasksSettled = (tasks: ITask[]) => tasks.every((task) => TASK_SETTLED_STATUSES.includes(task.status));

// The backend refuses a rerun when every task completed, so only a pipeline with something to retry offers it.
export const getPipelineActions = (status: IPipelineStatus) => ({
  cancel: RUNNING_STATUSES.includes(status),
  rerun: RERUNNABLE_STATUSES.includes(status),
});

export const canRerunTask = (status: IPipelineStatus) => FINISHED_STATUSES.includes(status);

export const getStageState = (tasks: ITask[]): StageState => {
  if (tasks.some((task) => [ACTIVE, RUNNING].includes(task.status))) return STAGE_STATE.LOADING;
  if (tasks.every((task) => task.status === COMPLETED)) return STAGE_STATE.SUCCESS;
  if (tasks.some((task) => task.status === FAILED)) return STAGE_STATE.ERROR;
  if (tasks.some((task) => task.status === CANCELLED)) return STAGE_STATE.CANCEL;
  return STAGE_STATE.READY;
};

export const groupStages = (tasks: ITask[]): PipelineStage[] =>
  Object.entries(groupBy(sortBy(tasks, 'id'), 'pipelineRow'))
    .map(([key, stageTasks]) => ({ key, tasks: stageTasks, state: getStageState(stageTasks) }))
    .sort((a, b) => Number(a.key) - Number(b.key));

const toTime = (value: string | null) => (value ? new Date(value).getTime() : undefined);

export const getStageTimes = (tasks: ITask[]) => {
  const began = tasks.map((task) => toTime(task.beganAt)).filter((time): time is number => time !== undefined);
  const finished = tasks.map((task) => toTime(task.finishedAt)).filter((time): time is number => time !== undefined);
  const settled = areTasksSettled(tasks) && finished.length === tasks.length;
  return {
    beganAt: began.length ? new Date(Math.min(...began)).toISOString() : null,
    finishedAt: settled ? new Date(Math.max(...finished)).toISOString() : null,
  };
};

export const STAGE_STATE_STATUS = {
  [STAGE_STATE.LOADING]: RUNNING,
  [STAGE_STATE.SUCCESS]: COMPLETED,
  [STAGE_STATE.ERROR]: FAILED,
  [STAGE_STATE.CANCEL]: CANCELLED,
  [STAGE_STATE.READY]: PENDING,
} as const;

export const getTaskCell = ({ status, progressDetail }: ITask): TaskCell => {
  const { finishedSubTasks = 0, totalSubTasks = 0 } = progressDetail ?? {};
  if (status === FAILED) return { kind: TASK_CELL.FAILED };
  if (status === CANCELLED) return { kind: TASK_CELL.CANCELLED };
  if ([CREATED, PENDING].includes(status)) return { kind: TASK_CELL.PENDING };
  const counted = totalSubTasks > 0;
  // A finished task that reports no subtasks still shows a full bar.
  if ([COMPLETED, PARTIAL].includes(status)) {
    const total = Math.max(totalSubTasks, 1);
    return { kind: TASK_CELL.PROGRESS, finished: total, total, counted };
  }
  return { kind: TASK_CELL.PROGRESS, finished: finishedSubTasks, total: totalSubTasks, counted };
};

export const buildPipelineQuery = (
  query: ListQuery<PipelineSortKey>,
  { blueprintId }: PipelineFilters,
): ListParams => ({
  page: query.page,
  pageSize: query.pageSize,
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,
  blueprint_id: blueprintId || undefined,
});

type BlueprintSummary = Pick<IBlueprint, 'id' | 'name'>;

export const toBlueprintOptions = (blueprints: BlueprintSummary[] = [], selected?: BlueprintSummary) => {
  const all = selected && !blueprints.some(({ id }) => id === selected.id) ? [selected, ...blueprints] : blueprints;
  return all.map(({ id, name }) => ({ value: String(id), label: name }));
};

export const pickConfig = (pipeline: IPipeline) => pick(pipeline, PICKED_CONFIG_FIELDS);
