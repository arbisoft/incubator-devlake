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

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { OVERFLOW_LAYOUT } from './constants';
import { OverflowList } from './overflow-list';
import { splitOverflow } from './utils';

const MORE = (count: number) => `+${count} more`;
const items = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ key: `k${index}`, node: `item ${index + 1}` }));

describe('splitOverflow', () => {
  it('keeps everything visible when the list fits', () => {
    expect(splitOverflow([1, 2], 2)).toEqual({ visible: [1, 2], hidden: [] });
  });

  it('splits after the cap', () => {
    expect(splitOverflow([1, 2, 3, 4, 5], 2)).toEqual({ visible: [1, 2], hidden: [3, 4, 5] });
  });

  it('treats a negative cap as zero', () => {
    expect(splitOverflow([1, 2], -1)).toEqual({ visible: [], hidden: [1, 2] });
  });
});

describe('OverflowList', () => {
  it('shows every item and no toggle when the list fits', () => {
    renderWithTheme(<OverflowList items={items(2)} max={2} moreLabel={MORE} />);
    expect(screen.getByText('item 2')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the first items and a count of the rest', () => {
    renderWithTheme(<OverflowList items={items(5)} max={2} moreLabel={MORE} />);
    expect(screen.getByText('item 2')).toBeTruthy();
    expect(screen.queryByText('item 3')).toBeNull();
    expect(screen.getByRole('button', { name: MORE(3) })).toBeTruthy();
  });

  it('lists the hidden items when the toggle receives focus', async () => {
    renderWithTheme(<OverflowList items={items(4)} max={2} moreLabel={MORE} />);
    fireEvent.focus(screen.getByRole('button', { name: MORE(2) }));
    await waitFor(() => expect(screen.getByText('item 4')).toBeTruthy());
    expect(screen.getByText('item 3')).toBeTruthy();
  });

  it('lays the items out in a row for the inline layout and keeps the toggle a button', () => {
    renderWithTheme(<OverflowList items={items(4)} max={2} moreLabel={MORE} layout={OVERFLOW_LAYOUT.INLINE} />);
    expect(getComputedStyle(screen.getByRole('list')).flexWrap).toBe('wrap');
    expect(screen.getByRole('button', { name: MORE(2) }).tagName).toBe('BUTTON');
  });

  it('stacks the items by default', () => {
    renderWithTheme(<OverflowList items={items(2)} max={2} moreLabel={MORE} />);
    expect(getComputedStyle(screen.getByRole('list')).flexWrap).not.toBe('wrap');
  });
});
