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

import { METRIC_TILE_TONE } from './constants';
import { MetricTile } from './metric-tile';

describe('MetricTile', () => {
  it('shows its label, value and hint as a term and its descriptions', () => {
    renderWithTheme(<MetricTile label="Failed" value={3} hint="Last 7 days" />);
    expect(screen.getByText('Failed').tagName).toBe('DT');
    expect(screen.getByText('3').tagName).toBe('DD');
    expect(screen.getByText('Last 7 days')).toBeTruthy();
  });

  it('renders the on-brand tone with the same content', () => {
    renderWithTheme(<MetricTile label="DORA metrics" value="4" tone={METRIC_TILE_TONE.ON_BRAND} />);
    expect(screen.getByText('DORA metrics').tagName).toBe('DT');
    expect(screen.getByText('4').getAttribute('title')).toBe('4');
  });
});
