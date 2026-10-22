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

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import type { SubTasksRes } from '@/api/pipeline/types';
import { PATHS } from '@/config';

import {
  createDeferred,
  makeOnboardContext,
  makeOnboardRecord,
  onboardTree,
  renderOnboard,
  waitForOnboardActionPending,
  waitForOnboardActionSettled,
} from './__tests__/onboard.test-utils';
import { STORE_KEY, TASK_STATUS } from './components/constants';
import { COPY, DASHBOARD_WINDOW_FEATURES, DASHBOARD_WINDOW_TARGET, WIZARD_STEP } from './constants';
import { DASHBOARD_URL } from './dashboard-url';
import { Step4 } from './step-4';

const mocks = vi.hoisted(() => ({ data: undefined as unknown, navigate: vi.fn() }));

vi.mock('antd', async (importOriginal) =>
  (await import('./__tests__/onboard-antd-mock')).mockOnboardAntd(importOriginal),
);

vi.mock('@/api', () => ({
  default: {
    blueprint: { trigger: vi.fn(), pipelines: vi.fn() },
    pipeline: { subTasks: vi.fn() },
    store: { set: vi.fn() },
  },
}));

vi.mock('@/hooks', () => ({ useAutoRefresh: () => ({ data: mocks.data }) }));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

const blueprintTrigger = vi.mocked(API.blueprint.trigger);
const blueprintPipelines = vi.mocked(API.blueprint.pipelines);
const storeSet = vi.mocked(API.store.set);

type OnboardTaskResponse = Omit<SubTasksRes, 'subtasks'> & { subtasks: SubTasksRes['subtasks'] | null };

const taskResponse = (status: string, subtasks: SubTasksRes['subtasks'] | null): OnboardTaskResponse => ({
  status,
  completionRate: 0,
  subtasks,
});

const setup = (status: string = TASK_STATUS.RUNNING) => {
  const record = makeOnboardRecord();
  const value = makeOnboardContext({ step: WIZARD_STEP.RESULT, records: [record], plugin: record.plugin });
  mocks.data = taskResponse(status, []);
  const view = renderOnboard(<Step4 />, value);
  return { record, value, ...view };
};

const recollectButton = () => {
  const button = screen.getByText(COPY.result.recollect).closest('button');
  if (!button) {
    throw new Error('Recollect action is unavailable.');
  }
  return button;
};

describe('Step4 collection progress and actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.data = undefined;
    blueprintTrigger.mockReset().mockResolvedValue({ id: 91 });
    blueprintPipelines.mockReset().mockResolvedValue({ pipelines: [{ id: 83 }] });
    storeSet.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['null subtasks', taskResponse(TASK_STATUS.RUNNING, null)],
    ['absent data', undefined],
    ['empty subtasks', taskResponse(TASK_STATUS.RUNNING, [])],
  ])('renders running progress safely with %s', (_name, data) => {
    const record = makeOnboardRecord();
    const value = makeOnboardContext({ step: WIZARD_STEP.RESULT, records: [record], plugin: record.plugin });
    mocks.data = data;

    const view = renderOnboard(<Step4 />, value);

    expect(screen.getByText(COPY.result.syncing(record.scopeName))).toBeTruthy();
    expect(screen.getByText(COPY.result.progress)).toBeTruthy();
    expect(screen.queryByText(COPY.result.collectNonGit(COPY.result.unknownRepo))).toBeNull();
    expect(blueprintTrigger).not.toHaveBeenCalled();
    expect(storeSet).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();

    view.unmount();
  });

  it('does not persist or change records when recollection has no usable pipeline ID', async () => {
    const { record, value } = setup(TASK_STATUS.PARTIAL);
    blueprintTrigger.mockResolvedValueOnce({});
    blueprintPipelines.mockResolvedValueOnce({ pipelines: [{}] });

    const recollect = recollectButton();
    fireEvent.click(recollect);
    await waitForOnboardActionSettled(recollect);

    expect(message.error).toHaveBeenCalledWith(COPY.scope.pipelineUnavailable);
    expect(blueprintTrigger).toHaveBeenCalledWith(record.blueprintId, { skipCollectors: false, fullSync: false });
    expect(blueprintPipelines).toHaveBeenCalledWith(record.blueprintId);
    expect(storeSet).not.toHaveBeenCalled();
    expect(value.setRecords).not.toHaveBeenCalled();
    expect(value.records).toEqual([record]);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it.each([TASK_STATUS.PARTIAL, TASK_STATUS.FAILED])(
    'guards duplicate %s recollection actions and locks Finish while collection is pending',
    async (status) => {
      const { value, rerender } = setup(status);
      const pendingTrigger = createDeferred<unknown>();
      blueprintTrigger.mockReturnValueOnce(pendingTrigger.promise);
      const recollect = recollectButton();

      act(() => {
        recollect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        recollect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await waitFor(() => expect(blueprintTrigger).toHaveBeenCalledTimes(1));
      await waitForOnboardActionPending(recollectButton());
      expect(recollectButton().disabled).toBe(true);

      mocks.data = taskResponse(TASK_STATUS.COMPLETED, []);
      rerender(onboardTree(<Step4 />, value));
      const finish = screen.getByText(COPY.result.finish).closest('button');
      if (!finish) {
        throw new Error('Finish action is unavailable.');
      }
      expect(finish.disabled).toBe(true);
      act(() => finish.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      expect(storeSet).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();

      await act(async () => {
        pendingTrigger.resolve({ id: 91 });
        await pendingTrigger.promise;
      });
      await waitFor(() => expect(storeSet).toHaveBeenCalledTimes(1));
      expect(storeSet).toHaveBeenCalledWith(
        STORE_KEY,
        expect.objectContaining({ records: [expect.objectContaining({ pipelineId: 91 })] }),
      );
    },
  );

  it('shows the new pipeline and warns when saving progress fails after a successful trigger', async () => {
    const { value } = setup(TASK_STATUS.FAILED);
    const setRecords = vi.mocked(value.setRecords);
    storeSet.mockRejectedValueOnce(new Error('safe persistence failure'));

    const recollect = recollectButton();
    fireEvent.click(recollect);
    await waitFor(() => expect(message.warning).toHaveBeenCalledWith(COPY.result.progressNotSaved));

    expect(setRecords).toHaveBeenCalledTimes(1);
    expect(setRecords.mock.calls[0]?.[0][0]?.pipelineId).toBe(91);
    expect(setRecords.mock.invocationCallOrder[0]).toBeLessThan(storeSet.mock.invocationCallOrder[0]);
    expect(message.error).not.toHaveBeenCalled();
    await waitForOnboardActionSettled(recollect);
  });

  it('persists the new records after a successful recollection', async () => {
    const { value } = setup(TASK_STATUS.FAILED);

    const recollect = recollectButton();
    fireEvent.click(recollect);
    await waitFor(() => expect(storeSet).toHaveBeenCalledTimes(1));

    expect(storeSet.mock.calls[0]?.[1]).toMatchObject({ records: [expect.objectContaining({ pipelineId: 91 })] });
    expect(value.setRecords).toHaveBeenCalledTimes(1);
    expect(message.warning).not.toHaveBeenCalled();
    await waitForOnboardActionSettled(recollect);
  });

  it('opens the dashboard with explicit safe new-window settings', () => {
    setup(TASK_STATUS.COMPLETED);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    fireEvent.click(screen.getByRole('button', { name: COPY.result.dashboard }));

    expect(open).toHaveBeenCalledWith(DASHBOARD_URL['github'], DASHBOARD_WINDOW_TARGET, DASHBOARD_WINDOW_FEATURES);
  });

  it('stores completion and exits after Finish succeeds', async () => {
    setup(TASK_STATUS.COMPLETED);

    fireEvent.click(screen.getByRole('button', { name: COPY.result.finish }));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(PATHS.ROOT()));
    expect(storeSet).toHaveBeenCalledWith(STORE_KEY, expect.objectContaining({ done: true }));
  });
});
