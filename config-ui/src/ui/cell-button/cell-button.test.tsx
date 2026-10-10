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

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { CellButton } from './cell-button';

describe('CellButton', () => {
  it('renders a button that calls onClick', () => {
    const onClick = vi.fn();
    renderWithTheme(<CellButton onClick={onClick}>open</CellButton>);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no inline padding so it lines up with its column header', () => {
    renderWithTheme(<CellButton>open</CellButton>);
    expect(getComputedStyle(screen.getByRole('button', { name: 'open' })).paddingInline).toBe('0px');
  });
});
