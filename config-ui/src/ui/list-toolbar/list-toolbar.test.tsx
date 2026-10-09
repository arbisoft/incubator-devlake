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

import { ListToolbar } from './list-toolbar';

const PLACEHOLDER = 'Search keys';

describe('ListToolbar', () => {
  it('shows the list keyword and sends a submitted search to the list', () => {
    const setKeyword = vi.fn();
    renderWithTheme(<ListToolbar list={{ keyword: 'ci', setKeyword }} searchPlaceholder={PLACEHOLDER} />);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: PLACEHOLDER });
    expect(input.value).toBe('ci');
    fireEvent.change(input, { target: { value: 'deploy' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(setKeyword).toHaveBeenCalledExactlyOnceWith('deploy');
  });

  it('renders the filters after the search and the end actions', () => {
    renderWithTheme(
      <ListToolbar
        list={{ keyword: '', setKeyword: vi.fn() }}
        searchPlaceholder={PLACEHOLDER}
        filters={<span>filters</span>}
        end={<button>add</button>}
      />,
    );
    expect(screen.getByText('filters')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'add' })).toBeTruthy();
  });
});
