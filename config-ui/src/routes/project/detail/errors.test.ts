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

import { toUserMessage } from '@/ui/utils';

import { COPY, DELETE_ERROR_MAP, SAVE_ERROR_MAP } from './constants';

const httpError = (status: number, message = 'Error 1062: Duplicate entry (SQLSTATE 23000)') => ({
  response: { status, data: { message } },
});

describe('project error maps', () => {
  it('names a project that no longer exists, for a save and for a delete', () => {
    expect(toUserMessage(httpError(404), SAVE_ERROR_MAP, COPY.settings.saveFailed)).toBe(COPY.settings.notFound);
    expect(toUserMessage(httpError(404), DELETE_ERROR_MAP, COPY.settings.delete.failed)).toBe(COPY.settings.notFound);
  });

  it('explains that unfinished pipelines block the delete', () => {
    expect(toUserMessage(httpError(409), DELETE_ERROR_MAP, COPY.settings.delete.failed)).toBe(
      COPY.settings.delete.unfinishedPipelines,
    );
  });

  it('never shows the server message when a save fails, even for a name conflict', () => {
    const message = toUserMessage(httpError(500), SAVE_ERROR_MAP, COPY.settings.saveFailed);
    expect(message).toBe(COPY.settings.saveFailed);
    expect(message).not.toContain('Duplicate');
  });
});
