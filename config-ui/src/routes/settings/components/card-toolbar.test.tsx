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

import { COMMON_COPY } from '@/ui';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { CardToolbar } from './card-toolbar';

describe('CardToolbar', () => {
  it('shows the keyword, submits a new one and renders the buttons beside the search', () => {
    const setKeyword = vi.fn();
    renderWithTheme(
      <CardToolbar list={{ keyword: 'ann', setKeyword }} searchPlaceholder="Search people">
        <button type="button">Add person</button>
      </CardToolbar>,
    );
    const search = screen.getByPlaceholderText('Search people');
    expect((search as HTMLInputElement).value).toBe('ann');
    fireEvent.change(search, { target: { value: ' bob ' } });
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.search }));
    expect(setKeyword).toHaveBeenCalledWith('bob');
    expect(screen.getByRole('button', { name: 'Add person' })).toBeTruthy();
  });
});
