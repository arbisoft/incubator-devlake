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

import { IdentityCell } from './identity-cell';

describe('IdentityCell', () => {
  it('shows the primary and secondary lines', () => {
    renderWithTheme(<IdentityCell primary="Ann" secondary="ann@example.com" />);
    expect(screen.getByText('Ann')).toBeTruthy();
    expect(screen.getByText('ann@example.com')).toBeTruthy();
  });

  it('shows an adornment beside the primary line, and none when it is false', () => {
    const { rerender } = renderWithTheme(<IdentityCell primary="Ann" adornment={<span>tag</span>} />);
    expect(screen.getByText('tag')).toBeTruthy();
    rerender(<IdentityCell primary="Ann" adornment={false} />);
    expect(screen.queryByText('tag')).toBeNull();
    expect(screen.getByText('Ann')).toBeTruthy();
  });
});
