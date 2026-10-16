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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';

import { COPY } from './constants';
import { toOnboardCollectionErrorMessage, triggerOnboardPipeline } from './pipeline';

vi.mock('@/api', () => ({ default: { blueprint: { trigger: vi.fn(), pipelines: vi.fn() } } }));

const trigger = vi.mocked(API.blueprint.trigger);
const pipelines = vi.mocked(API.blueprint.pipelines);
const BLUEPRINT_ID = 47;
const AUTHORITATIVE_PIPELINE_ID = 83;
const STALE_PIPELINE_ID = 29;

describe('triggerOnboardPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the valid ID returned by trigger without reading the pipeline list', async () => {
    trigger.mockResolvedValue({ id: AUTHORITATIVE_PIPELINE_ID });

    await expect(triggerOnboardPipeline(BLUEPRINT_ID)).resolves.toBe(AUTHORITATIVE_PIPELINE_ID);

    expect(trigger).toHaveBeenCalledWith(BLUEPRINT_ID, { skipCollectors: false, fullSync: false });
    expect(pipelines).not.toHaveBeenCalled();
  });

  it('uses the first valid ID from the existing list when trigger has no ID', async () => {
    trigger.mockResolvedValue({});
    pipelines.mockResolvedValue({ pipelines: [{ id: 0 }, { id: String(STALE_PIPELINE_ID) }, { id: 83 }] });

    await expect(triggerOnboardPipeline(BLUEPRINT_ID)).resolves.toBe(String(STALE_PIPELINE_ID));

    expect(pipelines).toHaveBeenCalledWith(BLUEPRINT_ID);
  });

  it.each([
    { name: 'missing list', result: undefined },
    { name: 'malformed list wrapper', result: { pipelines: null } },
    { name: 'empty list', result: { pipelines: [] } },
    { name: 'list with an invalid ID', result: { pipelines: [{ id: 'not-a-number' }] } },
  ])('rejects when the $name has no usable pipeline ID', async ({ result }) => {
    trigger.mockResolvedValue({ id: 0 });
    pipelines.mockResolvedValue(result);

    await expect(triggerOnboardPipeline(BLUEPRINT_ID)).rejects.toThrow(COPY.scope.pipelineUnavailable);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '', '0', '-1', '1.5', 'abc'])(
    'rejects invalid trigger IDs',
    async (id) => {
      trigger.mockResolvedValue({ id });
      pipelines.mockResolvedValue({ pipelines: [] });

      await expect(triggerOnboardPipeline(BLUEPRINT_ID)).rejects.toThrow(COPY.scope.pipelineUnavailable);
    },
  );
});

describe('toOnboardCollectionErrorMessage', () => {
  it('shows the safe pipeline recovery copy for an unavailable ID', () => {
    expect(toOnboardCollectionErrorMessage(new Error(COPY.scope.pipelineUnavailable))).toBe(
      COPY.scope.pipelineUnavailable,
    );
  });

  it('preserves the existing generic fallback for unrelated errors', () => {
    expect(toOnboardCollectionErrorMessage(new Error('unrelated failure'))).toBe(COPY.scope.operationFailed);
  });

  it('preserves the existing HTTP response message', () => {
    expect(toOnboardCollectionErrorMessage({ response: { data: { message: 'request failed safely' } } })).toBe(
      'request failed safely',
    );
  });

  it('uses the existing generic fallback for non-string HTTP messages', () => {
    expect(toOnboardCollectionErrorMessage({ response: { data: { message: 42 } } })).toBe(COPY.scope.operationFailed);
  });
});
