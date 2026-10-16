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
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { BLUEPRINT_VIEW } from '@/config';
import type { IBlueprint } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY } from '@/ui/constants';

import { BLUEPRINT_ID, makeDetailBlueprint, NEXT_BLUEPRINT_ID } from './__tests__/blueprint-fixtures';
import { BlueprintDetail } from './blueprint-detail';
import type { ConfigurationProps } from './configuration/types';
import type { BlueprintStatusProps } from './types';

const LOAD_FAILED = 'The blueprint could not be loaded.';

vi.mock('@/api', () => ({ default: { blueprint: { get: vi.fn(), pipelines: vi.fn() } } }));

vi.mock('./configuration', () => ({
  BlueprintConfiguration: ({ blueprint, onRefresh, onShowStatus }: ConfigurationProps) => (
    <section>
      <span data-testid="configuration">{blueprint.name}</span>
      <button onClick={onRefresh}>Refresh blueprint</button>
      <button onClick={onShowStatus}>Show status</button>
    </section>
  ),
}));

vi.mock('./status', () => ({
  BlueprintStatus: ({ blueprint }: BlueprintStatusProps) => <span data-testid="status">{blueprint.name}</span>,
}));

const blueprintApi = vi.mocked(API.blueprint);

const BLUEPRINT = makeDetailBlueprint();
const RETRIED_BLUEPRINT = makeDetailBlueprint({ name: 'nightly refreshed' });

const renderDetail = (blueprintId = BLUEPRINT_ID, view = BLUEPRINT_VIEW.CONFIGURATION) =>
  renderWithTheme(
    <MemoryRouter>
      <BlueprintDetail blueprintId={blueprintId} context="advanced" view={view} />
    </MemoryRouter>,
  );

const resolveDetail = () => {
  blueprintApi.get.mockReset().mockResolvedValue(BLUEPRINT);
  blueprintApi.pipelines.mockReset().mockResolvedValue({ pipelines: [], count: 0 });
};

describe('BlueprintDetail', () => {
  beforeEach(() => {
    resolveDetail();
  });

  it.each([
    ['blueprint', 'get'],
    ['pipeline list', 'pipelines'],
  ] as const)('shows and retries an initial %s failure', async (_request, failedMethod) => {
    if (failedMethod === 'get') blueprintApi.get.mockRejectedValueOnce(new Error('offline'));
    else blueprintApi.pipelines.mockRejectedValueOnce(new Error('offline'));
    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: COMMON_COPY.retry }));

    expect((await screen.findByTestId('configuration')).textContent).toBe(BLUEPRINT.name);
    expect(blueprintApi.get).toHaveBeenCalledTimes(2);
    expect(blueprintApi.pipelines).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded configuration visible during a failed refresh and retries it', async () => {
    blueprintApi.get
      .mockResolvedValueOnce(BLUEPRINT)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(RETRIED_BLUEPRINT);
    renderDetail();
    expect((await screen.findByTestId('configuration')).textContent).toBe(BLUEPRINT.name);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh blueprint' }));
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    expect(screen.getByTestId('configuration').textContent).toBe(BLUEPRINT.name);

    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.retry }));
    await waitFor(() => expect(blueprintApi.get).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByTestId('configuration').textContent).toBe(RETRIED_BLUEPRINT.name));
  });

  it('clears retained detail when the blueprint id changes', async () => {
    let resolveBlueprint: ((blueprint: IBlueprint) => void) | undefined;
    let resolvePipelines: ((result: { pipelines: []; count: number }) => void) | undefined;
    const view = renderDetail();
    expect((await screen.findByTestId('configuration')).textContent).toBe(BLUEPRINT.name);
    blueprintApi.get.mockImplementationOnce(
      () =>
        new Promise<IBlueprint>((resolve) => {
          resolveBlueprint = resolve;
        }),
    );
    blueprintApi.pipelines.mockImplementationOnce(
      () =>
        new Promise<{ pipelines: []; count: number }>((resolve) => {
          resolvePipelines = resolve;
        }),
    );

    view.rerender(
      <MemoryRouter>
        <BlueprintDetail blueprintId={NEXT_BLUEPRINT_ID} context="advanced" view={BLUEPRINT_VIEW.CONFIGURATION} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('configuration')).toBeNull();
    await waitFor(() => expect(blueprintApi.get).toHaveBeenCalledTimes(2));

    if (!resolveBlueprint || !resolvePipelines) throw new Error('The next blueprint request did not start.');
    resolveBlueprint({ ...BLUEPRINT, id: NEXT_BLUEPRINT_ID, name: 'next' });
    resolvePipelines({ pipelines: [], count: 0 });
    expect((await screen.findByTestId('configuration')).textContent).toBe('next');
  });

  it('keeps configuration and status views available after a successful refresh', async () => {
    const view = renderDetail();
    expect(await screen.findByTestId('configuration')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh blueprint' }));
    await waitFor(() => expect(blueprintApi.get).toHaveBeenCalledTimes(2));

    view.rerender(
      <MemoryRouter>
        <BlueprintDetail blueprintId={BLUEPRINT_ID} context="advanced" view={BLUEPRINT_VIEW.STATUS} />
      </MemoryRouter>,
    );
    expect((await screen.findByTestId('status')).textContent).toBe(BLUEPRINT.name);
  });
});
