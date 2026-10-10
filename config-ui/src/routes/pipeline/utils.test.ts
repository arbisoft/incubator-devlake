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

import { IPipelineStatus, type IPipeline, type ITask } from '@/types';

import { STAGE_STATE, TASK_CELL } from './constants';
import {
  areTasksSettled,
  buildPipelineQuery,
  canRerunTask,
  getPipelineActions,
  getStageState,
  getStageTimes,
  getTaskCell,
  groupStages,
  isPipelineFinished,
  pickConfig,
  toBlueprintOptions,
} from './utils';

describe('pipeline list query', () => {
  const QUERY = { page: 2, pageSize: 10, sortBy: 'beganAt', sortOrder: 'desc' } as const;

  it('sends the blueprint filter as blueprint_id', () => {
    expect(buildPipelineQuery(QUERY, { blueprintId: '7' })).toEqual({ ...QUERY, blueprint_id: '7' });
  });

  it('omits blueprint_id when no blueprint is picked', () => {
    expect(buildPipelineQuery(QUERY, { blueprintId: '' }).blueprint_id).toBeUndefined();
  });
});

describe('toBlueprintOptions', () => {
  it('turns blueprints into select options keyed by id', () => {
    expect(toBlueprintOptions([{ id: 3, name: 'alpha' }])).toEqual([{ value: '3', label: 'alpha' }]);
  });

  it('is empty before the blueprints load', () => {
    expect(toBlueprintOptions()).toEqual([]);
  });

  it('keeps the picked blueprint listed even when a search no longer returns it', () => {
    const options = toBlueprintOptions([{ id: 4, name: 'beta' }], { id: 3, name: 'alpha' });
    expect(options.map(({ value }) => value)).toEqual(['3', '4']);
  });

  it('does not list the picked blueprint twice', () => {
    expect(toBlueprintOptions([{ id: 3, name: 'alpha' }], { id: 3, name: 'alpha' })).toHaveLength(1);
  });
});

describe('pickConfig', () => {
  it('keeps the id, name, plan and skip-on-fail fields only', () => {
    const pipeline = { id: 9, name: 'bp', plan: [[]], skipOnFail: true, status: 'TASK_COMPLETED', totalTasks: 4 };
    expect(pickConfig(pipeline as unknown as IPipeline)).toEqual({ id: 9, name: 'bp', plan: [[]], skipOnFail: true });
  });
});

const task = (overrides: Partial<ITask>): ITask => ({
  id: 1,
  plugin: 'github',
  status: IPipelineStatus.COMPLETED,
  pipelineRow: 1,
  pipelineCol: 1,
  beganAt: null,
  finishedAt: null,
  options: {},
  message: '',
  errorName: '',
  ...overrides,
});

describe('getPipelineActions', () => {
  it.each([
    [IPipelineStatus.ACTIVE, { cancel: true, rerun: false }],
    [IPipelineStatus.RUNNING, { cancel: true, rerun: false }],
    [IPipelineStatus.RERUN, { cancel: true, rerun: false }],
    [IPipelineStatus.CREATED, { cancel: false, rerun: false }],
    [IPipelineStatus.PENDING, { cancel: false, rerun: false }],
    [IPipelineStatus.COMPLETED, { cancel: false, rerun: false }],
    [IPipelineStatus.PARTIAL, { cancel: false, rerun: true }],
    [IPipelineStatus.FAILED, { cancel: false, rerun: true }],
    [IPipelineStatus.CANCELLED, { cancel: false, rerun: true }],
  ])('offers the valid actions for %s', (status, expected) => {
    expect(getPipelineActions(status)).toEqual(expected);
  });
});

describe('isPipelineFinished and canRerunTask', () => {
  it('treat the four finished statuses as done', () => {
    expect(Object.values(IPipelineStatus).filter(isPipelineFinished)).toEqual([
      IPipelineStatus.COMPLETED,
      IPipelineStatus.PARTIAL,
      IPipelineStatus.FAILED,
      IPipelineStatus.CANCELLED,
    ]);
    expect(Object.values(IPipelineStatus).filter(canRerunTask)).toEqual(
      Object.values(IPipelineStatus).filter(isPipelineFinished),
    );
  });
});

describe('getStageState', () => {
  it.each([
    [[IPipelineStatus.COMPLETED, IPipelineStatus.COMPLETED], STAGE_STATE.SUCCESS],
    [[IPipelineStatus.COMPLETED, IPipelineStatus.RUNNING], STAGE_STATE.LOADING],
    [[IPipelineStatus.COMPLETED, IPipelineStatus.FAILED], STAGE_STATE.ERROR],
    [[IPipelineStatus.COMPLETED, IPipelineStatus.CANCELLED], STAGE_STATE.CANCEL],
    [[IPipelineStatus.PENDING, IPipelineStatus.CREATED], STAGE_STATE.READY],
    [[IPipelineStatus.RUNNING, IPipelineStatus.FAILED], STAGE_STATE.LOADING],
  ])('reads %j as %s', (statuses, expected) => {
    expect(getStageState(statuses.map((status) => task({ status })))).toBe(expected);
  });
});

describe('groupStages', () => {
  it('groups tasks by stage in numeric order and each stage by task id', () => {
    const stages = groupStages([
      task({ id: 5, pipelineRow: 10 }),
      task({ id: 3, pipelineRow: 2 }),
      task({ id: 2, pipelineRow: 2 }),
      task({ id: 1, pipelineRow: 1, status: IPipelineStatus.FAILED }),
    ]);
    expect(stages.map(({ key }) => key)).toEqual(['1', '2', '10']);
    expect(stages[1].tasks.map(({ id }) => id)).toEqual([2, 3]);
    expect(stages[0].state).toBe(STAGE_STATE.ERROR);
  });

  it('is empty without tasks', () => {
    expect(groupStages([])).toEqual([]);
  });
});

const T_START = '2026-01-01T00:00:10.000Z';
const T_EARLY = '2026-01-01T00:00:05.000Z';
const T_END = '2026-01-01T00:00:20.000Z';
const T_LATE = '2026-01-01T00:01:00.000Z';

describe('getStageTimes', () => {
  it('spans the earliest start to the latest finish once every task settled', () => {
    const times = getStageTimes([
      task({ beganAt: T_START, finishedAt: T_END }),
      task({ beganAt: T_EARLY, finishedAt: T_LATE }),
    ]);
    expect(times).toEqual({ beganAt: T_EARLY, finishedAt: T_LATE });
  });

  it('has no finish while a task still runs', () => {
    const times = getStageTimes([
      task({ beganAt: T_START, finishedAt: T_END }),
      task({ status: IPipelineStatus.RUNNING, beganAt: T_START }),
    ]);
    expect(times.finishedAt).toBeNull();
    expect(times.beganAt).toBe(T_START);
  });

  it('has no times before anything started', () => {
    expect(getStageTimes([task({ status: IPipelineStatus.PENDING })])).toEqual({ beganAt: null, finishedAt: null });
  });
});

describe('getTaskCell', () => {
  it('shows progress from the subtask counts of a running task', () => {
    const cell = getTaskCell(
      task({ status: IPipelineStatus.RUNNING, progressDetail: { finishedSubTasks: 13, totalSubTasks: 20 } }),
    );
    expect(cell).toEqual({ kind: TASK_CELL.PROGRESS, finished: 13, total: 20, counted: true });
  });

  it('shows no progress for a running task without counts', () => {
    expect(getTaskCell(task({ status: IPipelineStatus.RUNNING }))).toMatchObject({
      finished: 0,
      total: 0,
      counted: false,
    });
  });

  it('shows a finished task as complete', () => {
    const cell = getTaskCell(
      task({ status: IPipelineStatus.COMPLETED, progressDetail: { finishedSubTasks: 3, totalSubTasks: 4 } }),
    );
    expect(cell).toEqual({ kind: TASK_CELL.PROGRESS, finished: 4, total: 4, counted: true });
  });

  it('shows a finished task without subtask counts as a full bar', () => {
    expect(getTaskCell(task({ status: IPipelineStatus.COMPLETED }))).toEqual({
      kind: TASK_CELL.PROGRESS,
      finished: 1,
      total: 1,
      counted: false,
    });
  });

  it.each([
    [IPipelineStatus.PENDING, TASK_CELL.PENDING],
    [IPipelineStatus.CREATED, TASK_CELL.PENDING],
    [IPipelineStatus.FAILED, TASK_CELL.FAILED],
    [IPipelineStatus.CANCELLED, TASK_CELL.CANCELLED],
  ])('shows %s as %s', (status, kind) => {
    expect(getTaskCell(task({ status }))).toEqual({ kind });
  });
});

describe('areTasksSettled', () => {
  it('is true only when no task is pending or running', () => {
    expect(areTasksSettled([task({}), task({ status: IPipelineStatus.FAILED })])).toBe(true);
    expect(areTasksSettled([task({}), task({ status: IPipelineStatus.RUNNING })])).toBe(false);
  });
});
