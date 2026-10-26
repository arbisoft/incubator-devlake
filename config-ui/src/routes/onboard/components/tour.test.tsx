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

import { render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import API from '@/api';

import { ONBOARD_DONE_STEP } from './constants';
import { OnboardTour } from './tour';

const mocks = vi.hoisted(() => ({
  steps: [] as Array<{ target?: unknown }>,
}));

vi.mock('antd', () => ({
  Tour: ({ steps }: { steps: Array<{ target?: unknown }> }) => {
    mocks.steps = steps;
    return <div data-testid="tour" />;
  },
}));

vi.mock('@/api', () => ({ default: { store: { get: vi.fn() } } }));

describe('OnboardTour', () => {
  it('resolves step targets from refs assigned after the first render', async () => {
    vi.mocked(API.store.get).mockResolvedValue({ step: ONBOARD_DONE_STEP, done: false });
    const nameRef = createRef<HTMLAnchorElement>();
    const connectionRef = createRef<HTMLButtonElement>();
    const configRef = createRef<HTMLAnchorElement | HTMLButtonElement>();
    const { findByTestId } = render(
      <OnboardTour nameRef={nameRef} connectionRef={connectionRef} configRef={configRef} />,
    );

    await findByTestId('tour');

    const name = document.createElement('a');
    const connection = document.createElement('button');
    const config = document.createElement('a');
    nameRef.current = name;
    connectionRef.current = connection;
    configRef.current = config;
    await waitFor(() => expect(mocks.steps).toHaveLength(3));
    const resolve = (target: unknown) => (typeof target === 'function' ? target() : target);
    expect(mocks.steps.map((step) => resolve(step.target))).toEqual([name, connection, config]);
  });
});
