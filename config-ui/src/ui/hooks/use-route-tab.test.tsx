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

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { RouteTab } from '@/ui/types';

import { useRouteTab } from './use-route-tab';

const ITEMS: RouteTab[] = [
  { key: 'overview', label: 'Overview', path: '/projects/a' },
  { key: 'settings', label: 'Settings', path: '/projects/a/settings' },
  { key: 'hidden', label: 'Hidden', path: '/projects/a/hidden', visible: false },
];

const activeKey = (pathname: string, items = ITEMS) =>
  renderHook(() => useRouteTab(items), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>
    ),
  }).result.current;

describe('useRouteTab', () => {
  it('returns the tab whose path matches', () => {
    expect(activeKey('/projects/a/settings')).toBe('settings');
  });

  it('prefers the most specific match for nested paths', () => {
    expect(activeKey('/projects/a/settings/members')).toBe('settings');
  });

  it('falls back to the first visible tab when nothing matches', () => {
    expect(activeKey('/elsewhere')).toBe('overview');
  });

  it('never selects a hidden tab', () => {
    expect(activeKey('/projects/a/hidden')).toBe('overview');
  });

  it('returns undefined without visible tabs', () => {
    expect(activeKey('/x', [])).toBeUndefined();
  });
});
