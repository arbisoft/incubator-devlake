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

import { fireEvent, screen } from '@testing-library/react';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';

import {
  makeOnboardContext,
  makeOnboardRecord,
  renderOnboard,
  waitForOnboardActionPending,
  waitForOnboardActionSettled,
} from './__tests__/onboard.test-utils';
import { COPY, ONBOARD_PLUGIN, WIZARD_STEP } from './constants';
import { Step3 } from './step-3';

vi.mock('antd', async (importOriginal) =>
  (await import('./__tests__/onboard-antd-mock')).mockOnboardAntd(importOriginal),
);

vi.mock('@/api', () => ({
  default: {
    project: { create: vi.fn() },
    scope: { batch: vi.fn() },
    blueprint: { update: vi.fn(), trigger: vi.fn(), pipelines: vi.fn() },
    store: { set: vi.fn() },
  },
}));

vi.mock('@/plugins', async () => {
  const { makeScopeItem } = await import('./__tests__/onboard.test-utils');
  return {
    DataScopeRemote: ({
      selectedScope,
      onChangeSelectedScope,
    }: {
      selectedScope: ReturnType<typeof makeScopeItem>[];
      onChangeSelectedScope: (scope: ReturnType<typeof makeScopeItem>[]) => void;
    }) => (
      <div>
        <button onClick={() => onChangeSelectedScope([makeScopeItem()])}>Choose repository</button>
        {selectedScope.length > 0 && <span>Scope selected</span>}
      </div>
    ),
    getPluginScopeName: () => 'octo/repo',
  };
});

vi.mock('./use-guide', () => ({ useGuide: () => '' }));

const projectCreate = vi.mocked(API.project.create);
const scopeBatch = vi.mocked(API.scope.batch);
const blueprintUpdate = vi.mocked(API.blueprint.update);
const blueprintTrigger = vi.mocked(API.blueprint.trigger);
const blueprintPipelines = vi.mocked(API.blueprint.pipelines);
const storeSet = vi.mocked(API.store.set);

describe('Step3 pipeline lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectCreate.mockResolvedValue({ blueprint: { id: 51 } });
    scopeBatch.mockResolvedValue(undefined);
    blueprintUpdate.mockResolvedValue(undefined);
    blueprintTrigger.mockResolvedValue({});
    blueprintPipelines.mockResolvedValue({ pipelines: [{}] });
    storeSet.mockResolvedValue(undefined);
  });

  it('keeps selected scopes and does not advance or persist when the triggered pipeline has no usable ID', async () => {
    const record = makeOnboardRecord();
    const value = makeOnboardContext({
      step: WIZARD_STEP.SCOPE,
      records: [record],
      plugin: ONBOARD_PLUGIN.GITHUB,
    });
    renderOnboard(<Step3 />, value);

    fireEvent.click(screen.getByRole('button', { name: 'Choose repository' }));
    const next = screen.getByRole('button', { name: COPY.next });
    fireEvent.click(next);
    await waitForOnboardActionPending(next);
    await waitForOnboardActionSettled(next);

    expect(message.error).toHaveBeenCalledWith(COPY.scope.pipelineUnavailable);
    expect(blueprintTrigger).toHaveBeenCalledWith(51, { skipCollectors: false, fullSync: false });
    expect(blueprintPipelines).toHaveBeenCalledWith(51);
    expect(storeSet).not.toHaveBeenCalled();
    expect(value.setRecords).not.toHaveBeenCalled();
    expect(value.setStep).not.toHaveBeenCalled();
    expect(value.records).toEqual([record]);
    expect(screen.getByText('Scope selected')).toBeTruthy();
  });
});
