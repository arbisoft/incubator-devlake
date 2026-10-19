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

import { describe, expect, it, vi } from 'vitest';

import { request } from '@/utils';

import { log, logBlob } from './index';

vi.mock('@/utils', () => ({ request: vi.fn() }));

const PIPELINE_ID = 9;
const LOG_ARCHIVE_PATH = `/pipelines/${PIPELINE_ID}/logging.tar.gz`;

describe('pipeline log API', () => {
  it('keeps the existing log request unchanged', async () => {
    vi.mocked(request).mockResolvedValue(true);

    await log(PIPELINE_ID);

    expect(request).toHaveBeenCalledExactlyOnceWith(LOG_ARCHIVE_PATH);
  });

  it('requests the archive once as an authenticated Blob response', async () => {
    const archive = new Blob(['archive']);
    vi.mocked(request).mockResolvedValue(archive);

    await expect(logBlob(PIPELINE_ID)).resolves.toBe(archive);

    expect(request).toHaveBeenCalledExactlyOnceWith(LOG_ARCHIVE_PATH, { responseType: 'blob' });
  });
});
