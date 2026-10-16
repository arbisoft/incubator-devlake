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
import type { ConfirmModalProps } from '@/ui/confirm-modal/types';

import { makeOnboardRecord, renderOnboard } from '../__tests__/onboard.test-utils';
import { DASHBOARD_WINDOW_FEATURES, DASHBOARD_WINDOW_TARGET, ONBOARD_PLUGIN, WIZARD_STEP } from '../constants';
import { DASHBOARD_URL } from '../dashboard-url';

import { OnboardCard } from './card';
import { COPY, STORE_KEY, TASK_STATUS } from './constants';
import type { OnboardStore } from './types';

const mocks = vi.hoisted(() => ({
  initial: undefined as unknown,
  updated: undefined as unknown,
  taskData: undefined as unknown,
}));

vi.mock('antd', async (importOriginal) =>
  (await import('../__tests__/onboard-antd-mock')).mockOnboardAntd(importOriginal),
);

vi.mock('@/api', () => ({
  default: { store: { get: vi.fn(), set: vi.fn() }, pipeline: { subTasks: vi.fn() } },
}));

vi.mock('@/hooks', () => ({
  useRefreshData: (_request: unknown, dependencies: readonly unknown[]) => ({
    ready: true,
    data: dependencies[0] === 0 ? mocks.initial : mocks.updated,
  }),
  useAutoRefresh: () => ({ data: mocks.taskData }),
}));

vi.mock('@/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/ui')>();
  return {
    ...original,
    ConfirmModal: ({ open, title, confirmLabel, loading, onConfirm }: ConfirmModalProps) =>
      open ? (
        <div role="dialog" aria-label={title}>
          <button disabled={loading} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      ) : null,
  };
});

const storeSet = vi.mocked(API.store.set);

const initialStore: OnboardStore = {
  step: WIZARD_STEP.RESULT,
  done: false,
  plugin: ONBOARD_PLUGIN.GITHUB,
  records: [makeOnboardRecord()],
};

const setup = () => {
  mocks.initial = initialStore;
  mocks.updated = null;
  mocks.taskData = { status: TASK_STATUS.COMPLETED };
  return renderOnboard(<OnboardCard />);
};

describe('OnboardCard actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeSet.mockReset().mockResolvedValue(undefined);
  });

  it('keeps the banner after a failed close and refreshes it after a successful retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storeSet.mockRejectedValueOnce(new Error('safe storage failure')).mockImplementationOnce(async (_key, value) => {
      mocks.updated = value;
    });
    setup();

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.finish }));
    fireEvent.click(screen.getByRole('button', { name: COPY.confirm.confirm }));
    await waitFor(() => expect(storeSet).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: COPY.confirm.title })).toBeNull());
    expect(screen.getByRole('region', { name: COPY.title })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.finish }));
    fireEvent.click(screen.getByRole('button', { name: COPY.confirm.confirm }));
    await waitFor(() => expect(screen.queryByRole('region', { name: COPY.title })).toBeNull());

    expect(storeSet).toHaveBeenCalledTimes(2);
    expect(storeSet).toHaveBeenNthCalledWith(2, STORE_KEY, expect.objectContaining({ done: true }));
  });

  it('opens the banner dashboard with explicit safe new-window settings', () => {
    setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.dashboard }));

    expect(open).toHaveBeenCalledWith(
      DASHBOARD_URL[ONBOARD_PLUGIN.GITHUB],
      DASHBOARD_WINDOW_TARGET,
      DASHBOARD_WINDOW_FEATURES,
    );
  });
});
