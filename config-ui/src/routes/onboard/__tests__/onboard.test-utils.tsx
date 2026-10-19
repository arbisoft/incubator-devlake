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

import { waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, vi } from 'vitest';

import type { ScopeItem } from '@/plugins/components/data-scope-remote/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { ONBOARD_PLUGIN, WIZARD_STEP } from '../constants';
import { Context } from '../context';
import type { OnboardContextValue, OnboardRecord } from '../types';

export const makeOnboardContext = (overrides: Partial<OnboardContextValue> = {}): OnboardContextValue => ({
  step: WIZARD_STEP.PROJECT,
  records: [],
  done: false,
  projectName: 'alpha',
  plugin: ONBOARD_PLUGIN.GITHUB,
  setStep: vi.fn(),
  setRecords: vi.fn(),
  setProjectName: vi.fn(),
  setPlugin: vi.fn(),
  ...overrides,
});

export const onboardTree = (children: ReactNode, value: OnboardContextValue = makeOnboardContext()): ReactElement => (
  <MemoryRouter>
    <Context.Provider value={value}>{children}</Context.Provider>
  </MemoryRouter>
);

export const renderOnboard = (children: ReactNode, value: OnboardContextValue = makeOnboardContext()) =>
  renderWithTheme(onboardTree(children, value));

export const waitForOnboardActionPending = (button: HTMLElement) =>
  waitFor(() => expect(button.classList.contains('ant-btn-loading')).toBe(true));

export const waitForOnboardActionSettled = (button: HTMLElement) =>
  waitFor(() => expect(button.classList.contains('ant-btn-loading')).toBe(false));

export const createDeferred = <T,>() => {
  let state:
    | {
        resolve: (value: T | PromiseLike<T>) => void;
        reject: (reason?: unknown) => void;
      }
    | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    state = { resolve, reject };
  });
  return {
    promise,
    resolve: (value: T) => state?.resolve(value),
    reject: (reason: unknown) => state?.reject(reason),
  };
};

export const makeOnboardRecord = (overrides: Partial<OnboardRecord> = {}): OnboardRecord => ({
  plugin: ONBOARD_PLUGIN.GITHUB,
  connectionId: 41,
  blueprintId: 47,
  pipelineId: 83,
  scopeName: 'octo/repo',
  ...overrides,
});

export const makeScopeItem = (): ScopeItem => ({
  type: 'scope',
  parentId: null,
  id: 'octo/repo',
  title: 'octo/repo',
  name: 'octo/repo',
  fullName: 'octo/repo',
  data: { githubId: 'octo/repo' },
});
