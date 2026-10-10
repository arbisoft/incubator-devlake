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

import { COPY } from './constants';
import { SelectedScopes } from './selected-scopes';
import type { ScopeItem } from './types';

vi.mock('@/plugins/utils', () => ({ getPluginScopeName: () => '' }));

const item = (id: string, fullName: string): ScopeItem => ({
  id,
  fullName,
  name: fullName,
  title: fullName,
  type: 'scope',
  parentId: null,
  data: {},
});

const ONE = 'octocat/one';
const TWO = 'octocat/two';
const SCOPES = [item('1', ONE), item('2', TWO)];

describe('SelectedScopes', () => {
  it('asks for a selection when nothing is picked', () => {
    renderWithTheme(<SelectedScopes plugin="github" scopes={[]} onChange={vi.fn()} />);
    expect(screen.getByText(COPY.noneSelected)).toBeTruthy();
    expect(screen.queryByRole('button', { name: COPY.clearAll })).toBeNull();
  });

  it('shows the count and a chip per scope', () => {
    renderWithTheme(<SelectedScopes plugin="github" scopes={SCOPES} onChange={vi.fn()} />);
    expect(screen.getByText(COPY.selected(2))).toBeTruthy();
    expect(screen.getByText(ONE)).toBeTruthy();
    expect(screen.getByText(TWO)).toBeTruthy();
  });

  it('removes one scope from its chip', () => {
    const onChange = vi.fn();
    renderWithTheme(<SelectedScopes plugin="github" scopes={SCOPES} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.remove(ONE) }));
    expect(onChange).toHaveBeenCalledWith([SCOPES[1]]);
  });

  it('clears the whole selection', () => {
    const onChange = vi.fn();
    renderWithTheme(<SelectedScopes plugin="github" scopes={SCOPES} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.clearAll }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
