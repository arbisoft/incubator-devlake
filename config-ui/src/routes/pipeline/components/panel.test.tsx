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

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { IPipelineStatus, type IPipeline, type ITask } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../constants';

import { PipelinePanel } from './panel';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/antd-message-mock')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

vi.mock('@/plugins', () => ({
  getPluginConfig: (plugin: string) => ({ plugin, name: plugin.toUpperCase(), icon: '' }),
}));

vi.mock('@/api', () => ({
  default: {
    pipeline: { get: vi.fn(), tasks: vi.fn(), remove: vi.fn(), rerun: vi.fn() },
    task: { rertun: vi.fn() },
  },
}));

const pipelines = vi.mocked(API.pipeline);
const tasksApi = vi.mocked(API.task);

const LONG_NAME = 'github_graphql:a-very-long-organisation-name/an-even-longer-repository-name-that-needs-truncating';

const pipeline = (status: IPipelineStatus): IPipeline => ({
  id: 9,
  status,
  beganAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  stage: 2,
  finishedTasks: 1,
  totalTasks: 3,
  message: '',
});

const task = (overrides: Partial<ITask>): ITask => ({
  id: 1,
  plugin: 'github',
  status: IPipelineStatus.COMPLETED,
  pipelineRow: 1,
  pipelineCol: 1,
  beganAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:30.000Z',
  options: { name: 'org/repo' },
  message: '',
  errorName: '',
  ...overrides,
});

const load = (status: IPipelineStatus, tasks: ITask[]) => {
  pipelines.get.mockResolvedValue(pipeline(status));
  pipelines.tasks.mockResolvedValue({ tasks });
  return renderWithTheme(<PipelinePanel id={9} />);
};

describe('PipelinePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelines.remove.mockResolvedValue({});
    pipelines.rerun.mockResolvedValue([]);
    tasksApi.rertun.mockResolvedValue({});
  });

  it('summarises the pipeline and groups its tasks into stages', async () => {
    load(IPipelineStatus.RUNNING, [
      task({ id: 1, pipelineRow: 1 }),
      task({ id: 2, pipelineRow: 2, status: IPipelineStatus.RUNNING }),
    ]);
    expect(await screen.findByText(COPY.summary.tasksValue(1, 3))).toBeTruthy();
    expect(await screen.findByRole('heading', { name: COPY.stage.label(1) })).toBeTruthy();
    expect(screen.getByRole('heading', { name: COPY.stage.label(2) })).toBeTruthy();
    expect(screen.getByText(COPY.stage.state.loading)).toBeTruthy();
    expect(screen.getByText(COPY.stage.state.success)).toBeTruthy();
  });

  it('offers cancel, and not rerun, while the pipeline runs', async () => {
    load(IPipelineStatus.RUNNING, [task({ status: IPipelineStatus.RUNNING })]);
    fireEvent.click(await screen.findByRole('button', { name: COPY.summary.cancel }));
    await waitFor(() => expect(pipelines.remove).toHaveBeenCalledWith(9));
    expect(screen.queryByRole('button', { name: COPY.summary.rerun })).toBeNull();
  });

  it('offers rerun, and not cancel, once the pipeline failed', async () => {
    load(IPipelineStatus.FAILED, [task({ status: IPipelineStatus.FAILED, errorName: 'boom' })]);
    expect(await screen.findByText(COPY.summary.failed)).toBeTruthy();
    expect(screen.queryByRole('button', { name: COPY.summary.cancel })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY.summary.rerun }));
    await waitFor(() => expect(pipelines.rerun).toHaveBeenCalledWith(9));
  });

  it('offers neither action once every task completed', async () => {
    load(IPipelineStatus.COMPLETED, [task({})]);
    await screen.findByRole('heading', { name: COPY.stage.label(1) });
    expect(screen.queryByRole('button', { name: COPY.summary.cancel })).toBeNull();
    expect(screen.queryByRole('button', { name: COPY.summary.rerun })).toBeNull();
  });

  it('reruns one finished task from its own button', async () => {
    load(IPipelineStatus.PARTIAL, [
      task({ id: 11, status: IPipelineStatus.FAILED }),
      task({ id: 12, status: IPipelineStatus.RUNNING }),
    ]);
    const buttons = await screen.findAllByRole('button', { name: COPY.task.rerun });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(tasksApi.rertun).toHaveBeenCalledWith(11));
  });

  it('keeps the full task name in a tooltip when it is truncated', async () => {
    load(IPipelineStatus.COMPLETED, [task({ plugin: 'github_graphql', options: { name: LONG_NAME.split(':')[1] } })]);
    const name = await screen.findByText(LONG_NAME.replace('github_graphql', 'GITHUB_GRAPHQL'));
    fireEvent.mouseEnter(name);
    expect((await screen.findByRole('tooltip')).textContent).toContain(LONG_NAME.split(':')[1]);
  });

  it('shows pending, cancelled and failed tasks as text', async () => {
    load(IPipelineStatus.FAILED, [
      task({ id: 1, status: IPipelineStatus.PENDING }),
      task({ id: 2, status: IPipelineStatus.CANCELLED }),
      task({ id: 3, status: IPipelineStatus.FAILED }),
    ]);
    expect(await screen.findByText(COPY.task.pending)).toBeTruthy();
    expect(screen.getByText(COPY.task.cancelled)).toBeTruthy();
    expect(screen.getAllByText(COPY.task.failed)).toHaveLength(3);
    expect(screen.getByText(COPY.stage.failedCount(1, 3))).toBeTruthy();
  });
});
