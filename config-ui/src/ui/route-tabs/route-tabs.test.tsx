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
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import type { RouteTab } from '@/ui/types';

import { ROUTE_TABS_VARIANT } from './constants';
import { RouteTabs } from './route-tabs';
import type { RouteTabsProps } from './types';

const CONFIG_LABEL = 'Configurations';
const CONFIG_PATH = '/blueprint/config';

const ITEMS: RouteTab[] = [
  { key: 'status', label: 'Status', path: '/blueprint' },
  { key: 'config', label: CONFIG_LABEL, path: CONFIG_PATH },
  { key: 'secret', label: 'Secret', path: '/blueprint/secret', visible: false },
];

const Location = () => <span data-testid="location">{useLocation().pathname}</span>;

const setup = (variant: RouteTabsProps['variant'], path = CONFIG_PATH) =>
  renderWithTheme(
    <MemoryRouter initialEntries={[path]}>
      <RouteTabs items={ITEMS} variant={variant} />
      <Location />
    </MemoryRouter>,
  );

describe('RouteTabs', () => {
  it('segmented: selects the tab for the current path and hides invisible tabs', () => {
    setup(ROUTE_TABS_VARIANT.SEGMENTED);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: CONFIG_LABEL }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Status' }).checked).toBe(false);
    expect(screen.queryByRole('radio', { name: 'Secret' })).toBeNull();
  });

  it('segmented: navigates to the chosen tab path', () => {
    setup(ROUTE_TABS_VARIANT.SEGMENTED);
    fireEvent.click(screen.getByRole('radio', { name: 'Status' }));
    expect(screen.getByTestId('location').textContent).toBe('/blueprint');
  });

  it('tabs: marks the active tab, falls back to the first tab and navigates', () => {
    setup(ROUTE_TABS_VARIANT.TABS, '/elsewhere');
    expect(screen.getByRole('tab', { name: 'Status' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: CONFIG_LABEL }));
    expect(screen.getByTestId('location').textContent).toBe(CONFIG_PATH);
  });
});
