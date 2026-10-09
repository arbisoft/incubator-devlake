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

import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { COLUMN_ID_PREFIX } from './constants';
import { usePaneKeyboard } from './use-pane-keyboard';

const FIRST = 'first';
const SECOND = 'second';
const CHECKBOX = 'checkbox';
const ARIA_CHECKED = 'aria-checked';

type PaneProps = { single?: boolean; onRowClick?: (name: string) => void };

const Pane = ({ single = false, onRowClick }: PaneProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = usePaneKeyboard(ref, single);
  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={(event) =>
        onRowClick?.((event.target as HTMLElement).closest('.infinite-scroll-component > div')?.textContent ?? '')
      }
    >
      <div id={`${COLUMN_ID_PREFIX}root`}>
        <div className="infinite-scroll-component">
          <div>
            <span className="checkbox" />
            {FIRST}
          </div>
          <div>
            <span className="checkbox checkbox-checked" />
            {SECOND}
          </div>
          <div>
            <span className="checkbox checkbox-indeterminate" />
            third
          </div>
        </div>
      </div>
      <div id={`${COLUMN_ID_PREFIX}first`}>
        <div className="infinite-scroll-component">
          <div>
            <span className="checkbox" />
            child
          </div>
        </div>
      </div>
    </div>
  );
};

describe('usePaneKeyboard', () => {
  it('exposes each row as a named checkbox with its state and one tab stop', () => {
    render(<Pane />);
    expect(screen.getByRole(CHECKBOX, { name: FIRST }).getAttribute(ARIA_CHECKED)).toBe('false');
    expect(screen.getByRole(CHECKBOX, { name: SECOND }).getAttribute(ARIA_CHECKED)).toBe('true');
    expect(screen.getByRole(CHECKBOX, { name: 'third' }).getAttribute(ARIA_CHECKED)).toBe('mixed');
    expect(screen.getByRole(CHECKBOX, { name: FIRST }).tabIndex).toBe(0);
    expect(screen.getByRole(CHECKBOX, { name: SECOND }).tabIndex).toBe(-1);
  });

  it('uses the radio role in single mode', () => {
    render(<Pane single />);
    expect(screen.getByRole('radio', { name: FIRST })).toBeTruthy();
  });

  it('toggles the focused row with Enter and Space', () => {
    const onRowClick = vi.fn();
    render(<Pane onRowClick={onRowClick} />);
    const row = screen.getByRole(CHECKBOX, { name: FIRST });
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenCalledWith(FIRST);
  });

  it('moves focus with the arrow keys and keeps a single tab stop', () => {
    render(<Pane />);
    const first = screen.getByRole(CHECKBOX, { name: FIRST });
    const second = screen.getByRole(CHECKBOX, { name: SECOND });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    fireEvent.keyDown(second, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
  });

  it('moves between columns with Left and Right', () => {
    render(<Pane />);
    const first = screen.getByRole(CHECKBOX, { name: FIRST });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const child = screen.getByRole(CHECKBOX, { name: 'child' });
    expect(document.activeElement).toBe(child);
    fireEvent.keyDown(child, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
  });
});
