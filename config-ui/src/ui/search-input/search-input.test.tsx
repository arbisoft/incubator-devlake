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

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTheme } from '@/theme/tokens';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY, SEARCH_DEBOUNCE_MS, SEARCH_TRIGGER } from '@/ui/constants';

import { SearchInput } from './search-input';

const PLACEHOLDER = 'Search users';

const setup = (props: { value?: string; allowClear?: boolean } = {}) => {
  const onSearch = vi.fn();
  const view = renderWithTheme(<SearchInput placeholder={PLACEHOLDER} onSearch={onSearch} {...props} />);
  return { ...view, onSearch, input: screen.getByRole<HTMLInputElement>('textbox', { name: PLACEHOLDER }) };
};

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('may shrink to a minimum width so a toolbar can keep one row', () => {
    const { input } = setup();
    const root = input.closest('.ant-space-compact') as Element;
    expect(getComputedStyle(root).minWidth).toBe(`${getTheme('light').layout.searchMinWidth}px`);
    expect(getComputedStyle(root).flexShrink).toBe('1');
  });

  it('submits the trimmed keyword on Enter', () => {
    const { input, onSearch } = setup();
    fireEvent.change(input, { target: { value: '  jira ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('jira', SEARCH_TRIGGER.SUBMIT);
  });

  it('submits through the attached search button', () => {
    const { input, onSearch } = setup();
    fireEvent.change(input, { target: { value: 'git' } });
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.search }));
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('git', SEARCH_TRIGGER.SUBMIT);
  });

  it('searches once after the debounce while typing', () => {
    const { input, onSearch } = setup();
    fireEvent.change(input, { target: { value: 'abc' } });
    advance(SEARCH_DEBOUNCE_MS - 1);
    expect(onSearch).not.toHaveBeenCalled();
    advance(1);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('abc', SEARCH_TRIGGER.TYPING);
  });

  it('shows the committed value and follows prop changes', () => {
    const { rerender } = renderWithTheme(<SearchInput value="one" placeholder={PLACEHOLDER} onSearch={vi.fn()} />);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: PLACEHOLDER }).value).toBe('one');
    rerender(<SearchInput value="two" placeholder={PLACEHOLDER} onSearch={vi.fn()} />);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: PLACEHOLDER }).value).toBe('two');
  });

  it('searches for an empty keyword when cleared', () => {
    const { onSearch } = setup({ value: 'abc', allowClear: true });
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.clear }));
    advance(SEARCH_DEBOUNCE_MS);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('', SEARCH_TRIGGER.SUBMIT);
  });

  it('searches an empty keyword after the debounce when the text is deleted', () => {
    const { input, onSearch } = setup({ value: 'abc', allowClear: true });
    fireEvent.change(input, { target: { value: '' } });
    advance(SEARCH_DEBOUNCE_MS);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('', SEARCH_TRIGGER.TYPING);
  });

  it('Enter cancels the pending debounce', () => {
    const { input, onSearch } = setup();
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    advance(SEARCH_DEBOUNCE_MS * 2);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('abc', SEARCH_TRIGGER.SUBMIT);
  });

  it('does not re-search when typing returns to the current value', () => {
    const { input, onSearch } = setup({ value: 'abc' });
    fireEvent.change(input, { target: { value: 'abcd' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    advance(SEARCH_DEBOUNCE_MS);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('searches again on Enter even when the keyword is unchanged', () => {
    const { input, onSearch } = setup({ value: 'abc' });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('abc', SEARCH_TRIGGER.SUBMIT);
  });

  it('unmount cancels a pending search', () => {
    const { input, onSearch, unmount } = setup();
    fireEvent.change(input, { target: { value: 'abc' } });
    unmount();
    advance(SEARCH_DEBOUNCE_MS * 2);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('keeps the draft when the value prop echoes what was typed', () => {
    const { input, onSearch, rerender } = setup();
    fireEvent.change(input, { target: { value: 'ab' } });
    advance(SEARCH_DEBOUNCE_MS);
    rerender(<SearchInput value="ab" placeholder={PLACEHOLDER} onSearch={onSearch} />);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: PLACEHOLDER }).value).toBe('ab');
    expect(onSearch).toHaveBeenCalledOnce();
  });
});
