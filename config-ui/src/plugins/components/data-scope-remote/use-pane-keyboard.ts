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

import { type KeyboardEvent, type RefObject, useCallback, useEffect } from 'react';

import { COLUMN_ID_PREFIX } from './constants';

const COLUMN_SELECTOR = `[id^='${COLUMN_ID_PREFIX}']`;
const ROW_SELECTOR = '.infinite-scroll-component > div';

const KEY = {
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  ENTER: 'Enter',
  SPACE: ' ',
} as const;

const getRows = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(ROW_SELECTOR));

const getColumnRows = (column: Element): HTMLElement[] =>
  Array.from(column.querySelectorAll<HTMLElement>(ROW_SELECTOR));

const getCheckedState = (row: HTMLElement): 'true' | 'false' | 'mixed' => {
  if (row.querySelector('.checkbox-indeterminate')) return 'mixed';
  return row.querySelector('.checkbox-checked, .radio-checked') ? 'true' : 'false';
};

const syncRow = (row: HTMLElement, isSingle: boolean, focusable: boolean) => {
  row.setAttribute('role', isSingle ? 'radio' : 'checkbox');
  row.setAttribute('aria-checked', getCheckedState(row));
  row.setAttribute('aria-label', row.textContent?.trim() ?? '');
  row.setAttribute('tabindex', focusable ? '0' : '-1');
};

const syncRows = (root: HTMLElement, isSingle: boolean) => {
  const rows = getRows(root);
  const active =
    rows.find((row) => row === document.activeElement) ?? rows.find((row) => row.tabIndex === 0) ?? rows[0];
  rows.forEach((row) => syncRow(row, isSingle, row === active));
};

const moveFocus = (row: HTMLElement, key: string): HTMLElement | undefined => {
  const column = row.closest(COLUMN_SELECTOR);
  if (!column) return undefined;
  const siblings = getColumnRows(column);
  const index = siblings.indexOf(row);

  if (key === KEY.UP) return siblings[index - 1];
  if (key === KEY.DOWN) return siblings[index + 1];
  const neighbour = key === KEY.LEFT ? column.previousElementSibling : column.nextElementSibling;
  if (!neighbour) return undefined;
  const neighbourRows = getColumnRows(neighbour);
  return key === KEY.LEFT
    ? (neighbourRows.find((r) => r.hasAttribute('selected')) ?? neighbourRows[0])
    : neighbourRows[0];
};

// The miller columns library renders clickable divs, so rows get a role, a roving tabindex and arrow keys here.
export const usePaneKeyboard = (ref: RefObject<HTMLElement | null>, isSingle: boolean) => {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    syncRows(root, isSingle);
    const observer = new MutationObserver(() => syncRows(root, isSingle));
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'selected'],
    });
    return () => observer.disconnect();
  }, [ref, isSingle]);

  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(ROW_SELECTOR);
    if (!row || row !== event.target) return;

    if (event.key === KEY.ENTER || event.key === KEY.SPACE) {
      event.preventDefault();
      row.click();
      return;
    }

    const next = moveFocus(row, event.key);
    if (next) {
      event.preventDefault();
      row.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    }
  }, []);
};
