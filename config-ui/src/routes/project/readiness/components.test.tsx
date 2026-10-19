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
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY, SIGNAL_STATE } from './constants';
import { ReadinessMeter } from './readiness-meter';
import { SignalStatusIcon } from './signal-status-icon';
import type { ProjectReadiness } from './types';

const readiness = (available: number): ProjectReadiness => ({
  project: 'alpha',
  signals: [],
  available,
  total: 3,
  percentLabel: null,
});

describe('ReadinessMeter', () => {
  it('labels the meter with the available count', () => {
    renderWithTheme(<ReadinessMeter readiness={readiness(2)} />);
    expect(screen.getByRole('img', { name: COPY.summary(2, 3) })).toBeTruthy();
  });

  it('draws one segment per signal in both sizes', () => {
    const { container, rerender } = renderWithTheme(<ReadinessMeter readiness={readiness(1)} />);
    expect(screen.getByRole('img').children).toHaveLength(3);
    rerender(<ReadinessMeter readiness={readiness(1)} large />);
    expect(container.querySelector('[role="img"]')?.children).toHaveLength(3);
  });
});

describe('SignalStatusIcon', () => {
  it.each(Object.values(SIGNAL_STATE))('names the %s state', (state) => {
    renderWithTheme(<SignalStatusIcon state={state} />);
    expect(screen.getByRole('img', { name: COPY.state[state] })).toBeTruthy();
  });

  it('renders the large variant with the same name', () => {
    renderWithTheme(<SignalStatusIcon state={SIGNAL_STATE.AVAILABLE} large />);
    expect(screen.getByRole('img', { name: COPY.state[SIGNAL_STATE.AVAILABLE] })).toBeTruthy();
  });
});
