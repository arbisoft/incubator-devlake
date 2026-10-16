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

import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { store } from '@/app/store';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { blueprint } from './__tests__/fixtures';
import { BlueprintConfiguration } from './configuration';
import { COPY } from './constants';
import { useBlueprintConfiguration } from './use-configuration';

vi.mock('antd', async (importOriginal) => {
  const { withMockedMessage } = await import('@/ui/__tests__/antd-message-mock');
  return withMockedMessage(await importOriginal<typeof import('antd')>());
});

vi.mock('@/api', () => ({ default: { blueprint: { update: vi.fn() } } }));

const callbacks = () => ({ onRefresh: vi.fn(), onShowStatus: vi.fn() });

const Wrapper = ({ children }: PropsWithChildren) => (
  <Provider store={store}>
    <MemoryRouter>{children}</MemoryRouter>
  </Provider>
);

const setup = (current = blueprint) => {
  const { onRefresh, onShowStatus } = callbacks();
  renderWithTheme(
    <Wrapper>
      <BlueprintConfiguration
        blueprint={current}
        connectionPath={(plugin, id) => `/connections/${plugin}/${id}`}
        onRefresh={onRefresh}
        onShowStatus={onShowStatus}
      />
    </Wrapper>,
  );
  return { onRefresh, onShowStatus };
};

const editor = () => screen.getByRole('textbox', { name: COPY.json.editor.label }) as HTMLTextAreaElement;
const save = () => screen.getByText(COPY.json.save).closest('button') as HTMLButtonElement;

const setupHook = () => {
  const { onRefresh, onShowStatus } = callbacks();
  const hook = renderHook(() => useBlueprintConfiguration({ blueprint, onRefresh, onShowStatus }), {
    wrapper: Wrapper,
  });
  return { ...hook, onRefresh, onShowStatus };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(API.blueprint.update).mockResolvedValue(blueprint);
});

afterEach(cleanup);

describe('BlueprintConfiguration advanced plan editor', () => {
  it('keeps invalid text visible and disables save until the plan is corrected', async () => {
    setup();
    const invalidText = '[{"plugin":"github"}]';
    fireEvent.change(editor(), { target: { value: invalidText } });
    expect(screen.getByRole('alert').textContent).toBe(COPY.json.invalidPlan);
    expect(editor().value).toBe(invalidText);
    expect(save().disabled).toBeTruthy();

    const correctedPlan = '[[{"plugin":"github"}]]';
    fireEvent.change(editor(), { target: { value: correctedPlan } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save().disabled).toBeFalsy();
    fireEvent.click(save());
    await waitFor(() =>
      expect(API.blueprint.update).toHaveBeenCalledWith(blueprint.id, {
        ...blueprint,
        plan: [[{ plugin: 'github' }]],
      }),
    );
  });

  it('shows no alert for an empty plan and keeps save disabled', () => {
    setup({ ...blueprint, plan: [[]] });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save().disabled).toBeTruthy();
  });

  it('shows no alert after reset', () => {
    setup();
    fireEvent.click(screen.getByText(COPY.json.editor.reset));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save().disabled).toBeTruthy();
  });

  it('keeps valid text after a failed save and retries it successfully', async () => {
    vi.mocked(API.blueprint.update).mockRejectedValueOnce(new Error('Request failed'));
    const { onRefresh } = setup();
    const planText = '[[{"plugin":"github","custom":true}]]';
    fireEvent.change(editor(), { target: { value: planText } });
    fireEvent.click(save());
    await waitFor(() => expect(API.blueprint.update).toHaveBeenCalledOnce());
    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(editor().value).toBe(planText);
    expect(onRefresh).not.toHaveBeenCalled();

    await waitFor(() => expect(save().disabled).toBeFalsy());
    fireEvent.click(save());
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(API.blueprint.update).toHaveBeenCalledTimes(2);
    expect(editor().value).toBe(planText);
  });
});

describe('useBlueprintConfiguration plan validation', () => {
  it('rejects invalid text when save is invoked directly and saves corrected JSON', async () => {
    const { result, onRefresh } = setupHook();
    await act(async () => result.current.setRawPlan('[]'));
    expect(result.current.invalidPlan).toBeTruthy();
    expect(result.current.rawPlan).toBe('[]');

    let invalidResult: boolean | undefined;
    await act(async () => {
      invalidResult = await result.current.savePlan();
    });
    expect(invalidResult).toBeFalsy();
    expect(API.blueprint.update).not.toHaveBeenCalled();
    expect(result.current.rawPlan).toBe('[]');

    const correctedPlan = '[[{"plugin":"github","options":{"include":["issues"]}}]]';
    await act(async () => result.current.setRawPlan(correctedPlan));
    expect(result.current.invalidPlan).toBeFalsy();
    let validResult: boolean | undefined;
    await act(async () => {
      validResult = await result.current.savePlan();
    });
    expect(validResult).toBeTruthy();
    expect(API.blueprint.update).toHaveBeenCalledWith(blueprint.id, {
      ...blueprint,
      plan: [[{ plugin: 'github', options: { include: ['issues'] } }]],
    });
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('retains a valid plan after a failed save and allows a successful retry', async () => {
    vi.mocked(API.blueprint.update).mockRejectedValueOnce(new Error('Request failed'));
    const { result, onRefresh } = setupHook();
    const planText = '[[{"plugin":"github","custom":true}]]';
    await act(async () => result.current.setRawPlan(planText));

    let failedResult: boolean | undefined;
    await act(async () => {
      failedResult = await result.current.savePlan();
    });
    expect(failedResult).toBeFalsy();
    expect(result.current.rawPlan).toBe(planText);
    expect(onRefresh).not.toHaveBeenCalled();

    let retriedResult: boolean | undefined;
    await act(async () => {
      retriedResult = await result.current.savePlan();
    });
    expect(retriedResult).toBeTruthy();
    expect(result.current.rawPlan).toBe(planText);
    expect(API.blueprint.update).toHaveBeenCalledTimes(2);
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
