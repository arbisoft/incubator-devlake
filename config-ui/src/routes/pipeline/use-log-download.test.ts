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

import { act, renderHook, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { saveAs } from 'file-saver';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';

import { COPY, LOGS_FILE_NAME } from './constants';
import { useLogDownload } from './use-log-download';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/antd-message-mock')).loadMockedMessage(importOriginal),
);

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

vi.mock('@/api', () => ({
  default: { pipeline: { logBlob: vi.fn() } },
}));

const PIPELINE_ID = 9;
const OTHER_PIPELINE_ID = 10;

const deferredBlob = () => {
  let complete: ((archive: Blob) => void) | undefined;
  const promise = new Promise<Blob>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve: (archive: Blob) => {
      if (!complete) throw new Error('The deferred archive was already settled.');
      const finish = complete;
      complete = undefined;
      finish(archive);
    },
    settle: (archive: Blob) => {
      if (!complete) return;
      const finish = complete;
      complete = undefined;
      finish(archive);
    },
  };
};

describe('useLogDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('ignores duplicate same-pipeline calls and clears pending after success', async () => {
    const deferred = deferredBlob();
    const archive = new Blob(['archive']);
    vi.mocked(API.pipeline.logBlob).mockReturnValueOnce(deferred.promise);
    const { result } = renderHook(() => useLogDownload());
    let first = Promise.resolve();
    let duplicate = Promise.resolve();

    try {
      act(() => {
        first = result.current.download(PIPELINE_ID);
        duplicate = result.current.download(String(PIPELINE_ID));
      });

      await waitFor(() => expect(API.pipeline.logBlob).toHaveBeenCalledOnce());
      expect(result.current.isDownloading(PIPELINE_ID)).toBe(true);
      expect(result.current.isDownloading(String(PIPELINE_ID))).toBe(true);
      expect(API.pipeline.logBlob).toHaveBeenCalledExactlyOnceWith(PIPELINE_ID);

      await act(async () => {
        deferred.resolve(archive);
        await first;
      });
      await duplicate;

      expect(result.current.isDownloading(PIPELINE_ID)).toBe(false);
      expect(saveAs).toHaveBeenCalledExactlyOnceWith(archive, LOGS_FILE_NAME);
      expect(message.error).not.toHaveBeenCalled();
      expect(message.success).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        deferred.settle(archive);
        await first;
        await duplicate;
      });
    }
  });

  it('runs downloads for different pipelines independently', async () => {
    const firstDeferred = deferredBlob();
    const secondDeferred = deferredBlob();
    const archive = new Blob(['archive']);
    vi.mocked(API.pipeline.logBlob).mockImplementation((id) =>
      id === PIPELINE_ID ? firstDeferred.promise : secondDeferred.promise,
    );
    const { result } = renderHook(() => useLogDownload());
    let first = Promise.resolve();
    let second = Promise.resolve();

    try {
      act(() => {
        first = result.current.download(PIPELINE_ID);
        second = result.current.download(OTHER_PIPELINE_ID);
      });

      await waitFor(() => expect(API.pipeline.logBlob).toHaveBeenCalledTimes(2));
      expect(result.current.isDownloading(PIPELINE_ID)).toBe(true);
      expect(result.current.isDownloading(OTHER_PIPELINE_ID)).toBe(true);

      await act(async () => {
        firstDeferred.resolve(archive);
        await first;
      });
      expect(result.current.isDownloading(PIPELINE_ID)).toBe(false);
      expect(result.current.isDownloading(OTHER_PIPELINE_ID)).toBe(true);

      await act(async () => {
        secondDeferred.resolve(archive);
        await second;
      });
      expect(result.current.isDownloading(OTHER_PIPELINE_ID)).toBe(false);
      expect(saveAs).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => {
        firstDeferred.settle(archive);
        secondDeferred.settle(archive);
        await first;
        await second;
      });
    }
  });

  it('reports a missing archive safely and permits a successful retry', async () => {
    const archive = new Blob(['archive']);
    vi.mocked(API.pipeline.logBlob)
      .mockRejectedValueOnce({ response: { status: 404, data: { message: 'safe missing response' } } })
      .mockResolvedValueOnce(archive);
    const { result } = renderHook(() => useLogDownload());

    await act(async () => result.current.download(PIPELINE_ID));

    expect(message.error).toHaveBeenCalledExactlyOnceWith(COPY.actions.logsNotFound);
    expect(result.current.isDownloading(PIPELINE_ID)).toBe(false);
    expect(saveAs).not.toHaveBeenCalled();

    await act(async () => result.current.download(PIPELINE_ID));

    expect(API.pipeline.logBlob).toHaveBeenCalledTimes(2);
    expect(result.current.isDownloading(PIPELINE_ID)).toBe(false);
    expect(saveAs).toHaveBeenCalledExactlyOnceWith(archive, LOGS_FILE_NAME);
    expect(message.success).not.toHaveBeenCalled();
  });

  it('uses fallback copy for other failures and handles them without rejection', async () => {
    vi.mocked(API.pipeline.logBlob).mockRejectedValueOnce({
      response: { status: 500, data: { message: 'safe server response' } },
    });
    const { result } = renderHook(() => useLogDownload());

    await act(async () => {
      await result.current.download(PIPELINE_ID);
    });

    expect(message.error).toHaveBeenCalledExactlyOnceWith(COPY.actions.downloadFailed);
    expect(result.current.isDownloading(PIPELINE_ID)).toBe(false);
    expect(saveAs).not.toHaveBeenCalled();
  });
});
