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

import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { Onboard } from '.';

const mocks = vi.hoisted(() => ({ step0Renders: 0 }));

vi.mock('@/api', () => ({ default: { store: { get: vi.fn() } } }));

vi.mock('./step-0', () => ({
  Step0: () => {
    mocks.step0Renders += 1;
    return <div>step-0</div>;
  },
}));
vi.mock('./step-1', () => ({ Step1: () => <div>step-1</div> }));
vi.mock('./step-2', () => ({ Step2: () => <div>step-2</div> }));
vi.mock('./step-3', () => ({ Step3: () => <div>step-3</div> }));
vi.mock('./step-4', () => ({ Step4: () => <div>step-4</div> }));
vi.mock('./components', () => ({ ExitControl: () => <div>exit</div> }));

const renderOnboard = () =>
  renderWithTheme(
    <MemoryRouter>
      <Onboard />
    </MemoryRouter>,
  );

describe('Onboard', () => {
  beforeEach(() => {
    mocks.step0Renders = 0;
  });

  it('opens straight on the stored step without rendering step 0 first', async () => {
    vi.mocked(API.store.get).mockResolvedValue({ step: 2, records: [], projectName: 'alpha', plugin: 'github' });
    renderOnboard();

    expect(await screen.findByText('step-2')).toBeTruthy();
    expect(mocks.step0Renders).toBe(0);
  });

  it('starts at step 0 when nothing is stored', async () => {
    vi.mocked(API.store.get).mockResolvedValue(null);
    renderOnboard();

    expect(await screen.findByText('step-0')).toBeTruthy();
  });
});
