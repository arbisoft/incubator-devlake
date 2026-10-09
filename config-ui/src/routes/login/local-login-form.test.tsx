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
import { describe, expect, it, vi } from 'vitest';

import { WEIGHT } from '@/theme/scales';
import { getTheme } from '@/theme/tokens';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';
import { LocalLoginForm } from './local-login-form';
import { OrDivider } from './styled';

describe('LocalLoginForm', () => {
  it('draws the field labels at semibold weight', () => {
    renderWithTheme(<LocalLoginForm pending={false} onSubmit={vi.fn()} />);
    expect(getComputedStyle(screen.getByText(COPY.usernameLabel)).fontWeight).toBe(String(WEIGHT.semibold));
  });
});

describe('OrDivider', () => {
  it('draws its text in the secondary colour', () => {
    renderWithTheme(<OrDivider plain>{COPY.divider}</OrDivider>);
    const probe = document.createElement('span');
    probe.style.color = getTheme('light').colors.textSecondary;
    expect(getComputedStyle(screen.getByText(COPY.divider)).color).toBe(probe.style.color);
  });
});
