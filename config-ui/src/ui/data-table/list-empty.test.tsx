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
import { COMMON_COPY } from '@/ui/constants';
import { EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, EmptyState } from '@/ui/empty-state';

import { buildListEmpty } from './list-empty';

const EMPTY = { title: 'No keys yet' };
const NO_RESULTS = { title: 'No keys match your search' };
const BASE = { failed: false, onRetry: () => undefined, filtered: false, empty: EMPTY, noResults: NO_RESULTS };

describe('buildListEmpty', () => {
  it('shows the error state with a retry action when loading failed', () => {
    const props = buildListEmpty({ ...BASE, failed: true, filtered: true });
    expect(props.illustration).toBe(EMPTY_ILLUSTRATION.ERROR);
    expect(props.title).toBe(COMMON_COPY.genericError);
    expect(props.action).toBeTruthy();
  });

  it('shows the no-results copy when a search is active', () => {
    expect(buildListEmpty({ ...BASE, filtered: true })).toMatchObject({
      ...NO_RESULTS,
      size: EMPTY_STATE_SIZE.SECTION,
    });
  });

  it('shows the first-use copy when nothing is filtered', () => {
    expect(buildListEmpty(BASE)).toMatchObject({ ...EMPTY, size: EMPTY_STATE_SIZE.SECTION });
  });

  it('runs the retry callback from the error action', () => {
    const onRetry = vi.fn();
    renderWithTheme(<EmptyState {...buildListEmpty({ ...BASE, failed: true, onRetry })} />);
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.retry }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
