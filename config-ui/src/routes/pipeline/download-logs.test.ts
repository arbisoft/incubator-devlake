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

import { saveAs } from 'file-saver';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';

import { LOGS_FILE_NAME } from './constants';
import { downloadPipelineLogs } from './download-logs';

vi.mock('@/api', () => ({
  default: { pipeline: { logBlob: vi.fn() } },
}));

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

const PIPELINE_ID = 9;

describe('downloadPipelineLogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the archive from one authenticated API request to saveAs', async () => {
    const archive = new Blob(['archive']);
    vi.mocked(API.pipeline.logBlob).mockResolvedValue(archive);

    await downloadPipelineLogs(PIPELINE_ID);

    expect(API.pipeline.logBlob).toHaveBeenCalledExactlyOnceWith(PIPELINE_ID);
    expect(saveAs).toHaveBeenCalledExactlyOnceWith(archive, LOGS_FILE_NAME);
  });

  it('propagates request failures without starting a save', async () => {
    const failure = new Error('safe failure');
    vi.mocked(API.pipeline.logBlob).mockRejectedValue(failure);

    await expect(downloadPipelineLogs(PIPELINE_ID)).rejects.toBe(failure);

    expect(API.pipeline.logBlob).toHaveBeenCalledExactlyOnceWith(PIPELINE_ID);
    expect(saveAs).not.toHaveBeenCalled();
  });
});
