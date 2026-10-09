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

import { COPY, FILTER_TABS_VARIANT } from './constants';
import { FilterTabs } from './filter-tabs';

const SCM_LABEL = 'Code & SCM';
const CI_LABEL = 'CI/CD';

const ITEMS = [
  { key: 'all', label: 'All', count: 30 },
  { key: 'scm', label: SCM_LABEL, count: 6 },
  { key: 'ci', label: CI_LABEL },
];

describe('FilterTabs', () => {
  it('pill: shows counts, marks the value and reports a change', () => {
    const onChange = vi.fn();
    renderWithTheme(<FilterTabs items={ITEMS} value="all" onChange={onChange} variant={FILTER_TABS_VARIANT.PILL} />);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: COPY.withCount('All', 30) }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: CI_LABEL }).checked).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: COPY.withCount(SCM_LABEL, 6) }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('scm');
  });

  it('flat: renders tabs, selects the value and reports a change', () => {
    const onChange = vi.fn();
    renderWithTheme(<FilterTabs items={ITEMS} value="scm" onChange={onChange} variant={FILTER_TABS_VARIANT.FLAT} />);
    expect(screen.getByRole('tab', { name: COPY.withCount(SCM_LABEL, 6) }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: CI_LABEL }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('ci');
  });
});
