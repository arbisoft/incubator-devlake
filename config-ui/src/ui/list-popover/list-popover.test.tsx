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

import { ListPopover } from './list-popover';
import { ListPopoverRow } from './styled';
import type { ListPopoverProps } from './types';

const TITLE = 'Projects';
const FOOTER = 'Edit projects';

const setup = (props: Partial<ListPopoverProps> = {}) =>
  renderWithTheme(
    <ListPopover title={TITLE} count={2} {...props}>
      <ListPopoverRow>alpha</ListPopoverRow>
      <ListPopoverRow>beta</ListPopoverRow>
    </ListPopover>,
  );

describe('ListPopover', () => {
  it('shows the title, the count and every row', () => {
    setup();
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['alpha', 'beta']);
  });

  it('caps the list height with the theme token so long lists scroll', () => {
    setup();
    const { maxHeight, overflowY } = getComputedStyle(screen.getByRole('list'));
    expect(maxHeight).toBe('456px');
    expect(overflowY).toBe('auto');
  });

  it('renders the footer only when given one', () => {
    const { unmount } = setup();
    expect(screen.queryByText(FOOTER)).toBeNull();
    unmount();
    setup({ footer: <button type="button">{FOOTER}</button> });
    expect(screen.getByRole('button', { name: FOOTER })).toBeTruthy();
  });
});
