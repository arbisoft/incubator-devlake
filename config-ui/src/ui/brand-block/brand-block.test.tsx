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

import { POWERED_BY } from '@/config/brand';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { BrandBlock } from './brand-block';
import { COPY } from './constants';
import { PoweredByRow } from './powered-by';

const CUSTOM_TITLE = 'Acme Analytics';

describe('BrandBlock', () => {
  it('shows the mark with the two-line name when expanded', () => {
    renderWithTheme(<BrandBlock collapsed={false} title="" />);
    expect(screen.getByRole('img', { name: COPY.markAlt })).toBeTruthy();
    expect(screen.getByText(COPY.brandName)).toBeTruthy();
    expect(screen.getByText(COPY.productName)).toBeTruthy();
  });

  it('shows only the mark when collapsed', () => {
    renderWithTheme(<BrandBlock collapsed title="" />);
    expect(screen.getByRole('img', { name: COPY.markAlt })).toBeTruthy();
    expect(screen.queryByText(COPY.brandName)).toBeNull();
    expect(screen.queryByText(COPY.productName)).toBeNull();
  });

  it('shows the custom title when expanded', () => {
    renderWithTheme(<BrandBlock collapsed={false} title={CUSTOM_TITLE} />);
    expect(screen.getByRole('heading', { name: CUSTOM_TITLE })).toBeTruthy();
    expect(screen.queryByRole('img', { name: COPY.markAlt })).toBeNull();
  });

  it('shows the custom title initial when collapsed', () => {
    renderWithTheme(<BrandBlock collapsed title={CUSTOM_TITLE} />);
    expect(screen.getByRole('img', { name: CUSTOM_TITLE }).textContent).toBe('A');
  });
});

describe('PoweredByRow', () => {
  it('shows the powered-by text', () => {
    renderWithTheme(<PoweredByRow />);
    expect(screen.getByText(POWERED_BY)).toBeTruthy();
  });
});
