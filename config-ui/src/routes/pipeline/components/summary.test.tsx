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
import { IPipelineStatus, type IPipeline } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { resetLogActionMocks, restoreLogActionMocks } from '../__tests__/log-action.test-utils';
import { COPY } from '../constants';

import { PipelineSummary } from './summary';
import { PipelineTable } from './table';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/antd-message-mock')).loadMockedMessage(importOriginal),
);

vi.mock('@/api', () => ({
  default: { pipeline: { logBlob: vi.fn(), remove: vi.fn(), rerun: vi.fn() } },
}));

const PIPELINE: IPipeline = {
  id: 9,
  status: IPipelineStatus.RUNNING,
  beganAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  stage: 1,
  finishedTasks: 1,
  totalTasks: 2,
  message: '',
};

const downloadButton = () => screen.getByRole('button', { name: COPY.rowActions.downloadLogs });
const isDownloadPending = () => downloadButton().classList.contains('ant-btn-loading');
const actionMenuItem = (label: string) => screen.getByRole('menuitem', { name: new RegExp(`${label}$`) });
const hasActionMenuItem = (label: string) => screen.queryByRole('menuitem', { name: new RegExp(`${label}$`) });
const isDisabled = (item: HTMLElement) => item.getAttribute('aria-disabled') === 'true';

const TABLE_PIPELINE: IPipeline = {
  ...PIPELINE,
  name: 'Blueprint',
  status: IPipelineStatus.COMPLETED,
  finishedAt: '2026-01-01T00:01:00.000Z',
  totalTasks: 1,
};

beforeEach(resetLogActionMocks);

afterEach(restoreLogActionMocks);

describe('PipelineSummary log action', () => {
  it('shows download pending while keeping configuration and cancel available', async () => {
    let settled = false;
    let settleArchive: (archive: Blob) => void = (_archive) => {
      throw new Error('The log request did not start.');
    };
    const pending = new Promise<Blob>((resolve) => {
      settleArchive = (archive) => {
        if (settled) throw new Error('The log request was already settled.');
        settled = true;
        resolve(archive);
      };
    });
    const cleanupArchive = (archive: Blob) => {
      if (!settled) settleArchive(archive);
    };
    const archive = new Blob(['archive']);
    vi.mocked(API.pipeline.logBlob).mockReturnValueOnce(pending);
    renderWithTheme(<PipelineSummary pipeline={PIPELINE} onChanged={vi.fn()} />);

    try {
      fireEvent.click(downloadButton());
      await waitFor(() => expect(API.pipeline.logBlob).toHaveBeenCalledOnce());

      expect(isDownloadPending()).toBe(true);
      expect((screen.getByRole('button', { name: COPY.rowActions.configuration }) as HTMLButtonElement).disabled).toBe(
        false,
      );
      expect((screen.getByRole('button', { name: COPY.summary.cancel }) as HTMLButtonElement).disabled).toBe(false);

      await act(async () => settleArchive(archive));
      await waitFor(() => expect(isDownloadPending()).toBe(false));
    } finally {
      await act(async () => cleanupArchive(archive));
      await waitFor(() => expect(isDownloadPending()).toBe(false));
    }
  });

  it('shows a safe error on failure and keeps the other summary actions', async () => {
    vi.mocked(API.pipeline.logBlob).mockRejectedValueOnce({ response: { status: 404 } });
    renderWithTheme(<PipelineSummary pipeline={PIPELINE} onChanged={vi.fn()} />);

    fireEvent.click(downloadButton());

    await waitFor(() => expect(message.error).toHaveBeenCalledExactlyOnceWith(COPY.actions.logsNotFound));
    expect((downloadButton() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: COPY.rowActions.configuration })).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.summary.cancel })).toBeTruthy();
  });
});

describe('PipelineTable log action', () => {
  it('disables only the active log item while keeping configuration and detail enabled', async () => {
    let settled = false;
    let finishArchive: (archive: Blob) => void = (_archive) => {
      throw new Error('The log request did not start.');
    };
    const pending = new Promise<Blob>((resolve) => {
      finishArchive = (archive) => {
        if (settled) throw new Error('The log request was already settled.');
        settled = true;
        resolve(archive);
      };
    });
    const settleForCleanup = (archive: Blob) => {
      if (!settled) finishArchive(archive);
    };
    vi.mocked(API.pipeline.logBlob).mockReturnValueOnce(pending);
    renderWithTheme(<PipelineTable loading={false} dataSource={[TABLE_PIPELINE]} />);

    const actions = () => screen.getByRole('button', { name: COPY.rowActions.label(TABLE_PIPELINE.id) });

    try {
      fireEvent.click(actions());
      fireEvent.click(actionMenuItem(COPY.rowActions.downloadLogs));
      await waitFor(() => expect(API.pipeline.logBlob).toHaveBeenCalledOnce());

      fireEvent.click(actions());
      const logsItem = actionMenuItem(COPY.rowActions.downloadLogs);
      const configItem = actionMenuItem(COPY.rowActions.configuration);
      const detailItem = actionMenuItem(COPY.rowActions.detail);
      const logsDisabled = isDisabled(logsItem);
      const configDisabled = isDisabled(configItem);
      const detailDisabled = isDisabled(detailItem);
      expect(logsDisabled).toBe(true);
      expect(configDisabled).toBe(false);
      expect(detailDisabled).toBe(false);

      await act(async () => finishArchive(new Blob(['archive'])));
      await waitFor(() => {
        const logsDisabledAfterResolve = isDisabled(logsItem);
        expect(logsDisabledAfterResolve).toBe(false);
      });
    } finally {
      await act(async () => {
        settleForCleanup(new Blob(['cleanup']));
        await pending;
      });
      if (!hasActionMenuItem(COPY.rowActions.downloadLogs)) {
        fireEvent.click(actions());
      }
      await waitFor(() => {
        const logsDisabledAfterCleanup = isDisabled(actionMenuItem(COPY.rowActions.downloadLogs));
        expect(logsDisabledAfterCleanup).toBe(false);
      });
    }
  });
});
