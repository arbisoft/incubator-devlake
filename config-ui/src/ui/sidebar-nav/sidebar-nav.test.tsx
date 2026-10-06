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

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { pressEscape } from '@/ui/__tests__/keyboard';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY, NAV_ITEM_KIND } from '@/ui/constants';
import type { NavItem } from '@/ui/types';

import { COPY } from './constants';
import { SidebarNav } from './sidebar-nav';

const SETTINGS = 'Settings';
const SELECTED_CLASS = 'ant-menu-item-selected';

const ITEMS: NavItem[] = [
  { kind: NAV_ITEM_KIND.ROUTE, key: 'connections', label: 'Connections', icon: <i />, path: '/connections' },
  {
    kind: NAV_ITEM_KIND.ROUTE,
    key: 'settings',
    label: SETTINGS,
    icon: <i />,
    path: '/settings',
    children: [
      { kind: NAV_ITEM_KIND.ROUTE, key: 'users', label: 'Users', icon: <i />, path: '/settings/users' },
      { kind: NAV_ITEM_KIND.ROUTE, key: 'audit', label: 'Audit', icon: <i />, path: '/settings/audit', visible: false },
      { kind: NAV_ITEM_KIND.ROUTE, key: 'keys', label: 'Keys', icon: <i />, path: '/settings/keys' },
    ],
  },
  { kind: NAV_ITEM_KIND.DIVIDER, key: 'divider' },
  { kind: NAV_ITEM_KIND.EXTERNAL, key: 'docs', label: 'Docs', icon: <i />, href: 'https://example.com/docs' },
  { kind: NAV_ITEM_KIND.ROUTE, key: 'hidden', label: 'Hidden page', icon: <i />, path: '/hidden', visible: false },
];

const Location = () => <span data-testid="location">{useLocation().pathname}</span>;

const setup = (props: { activePath?: string; collapsed?: boolean } = {}) => {
  const onCollapsedChange = vi.fn();
  renderWithTheme(
    <MemoryRouter>
      <SidebarNav
        items={ITEMS}
        activePath={props.activePath ?? '/connections'}
        collapsed={props.collapsed ?? false}
        onCollapsedChange={onCollapsedChange}
        header={<span>Header slot</span>}
        footer={<span>Footer slot</span>}
      />
      <Location />
    </MemoryRouter>,
  );
  return { onCollapsedChange };
};

const menuItem = (name: string | RegExp) => screen.getByRole('menuitem', { name });

describe('SidebarNav', () => {
  it('renders the slots and visible items, and hides items with visible=false', () => {
    setup();
    expect(screen.getByText('Header slot')).toBeTruthy();
    expect(screen.getByText('Footer slot')).toBeTruthy();
    expect(screen.getByRole('menu', { name: COPY.navigation })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Connections' })).toBeTruthy();
    expect(screen.queryByText('Hidden page')).toBeNull();
    expect(screen.getByRole('separator')).toBeTruthy();
  });

  it('selects the active route and opens the group that contains it', () => {
    setup({ activePath: '/settings/users/42' });
    expect(menuItem('Users').className).toContain(SELECTED_CLASS);
    expect(menuItem('Keys').className).not.toContain(SELECTED_CLASS);
    expect(screen.queryByRole('menuitem', { name: 'Audit' })).toBeNull();
  });

  it('opens and closes a group from its title', () => {
    setup();
    expect(screen.queryByRole('menuitem', { name: 'Users' })).toBeNull();
    fireEvent.click(menuItem(SETTINGS));
    expect(menuItem('Users')).toBeTruthy();
  });

  it('navigates when a route item is activated by keyboard or click', () => {
    setup({ activePath: '/settings' });
    fireEvent.click(menuItem(SETTINGS));
    fireEvent.click(menuItem('Keys'));
    expect(screen.getByTestId('location').textContent).toBe('/settings/keys');
  });

  it('opens external items in a new tab', () => {
    setup();
    const link = screen.getByRole('link', {
      name: new RegExp(`^Docs.*${COMMON_COPY.opensInNewTab.replace(/[()]/g, '\\$&')}`),
    });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('asks to collapse through the toggle', () => {
    const { onCollapsedChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: COPY.collapse }));
    expect(onCollapsedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('collapses to a rail that keeps item names and asks to expand', () => {
    const { onCollapsedChange } = setup({ collapsed: true });
    expect(screen.getByRole('link', { name: 'Connections' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COPY.expand }));
    expect(onCollapsedChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('opens a group as a flyout on click in the rail, then closes it with Escape', async () => {
    setup({ collapsed: true });
    expect(screen.queryByRole('menuitem', { name: 'Users' })).toBeNull();
    fireEvent.click(menuItem(SETTINGS));
    expect(menuItem(SETTINGS).getAttribute('aria-expanded')).toBe('true');
    const flyout = await screen.findByRole('menuitem', { name: 'Users' });
    expect(within(flyout.closest('ul') as HTMLElement).queryByRole('menuitem', { name: 'Audit' })).toBeNull();
    pressEscape(flyout);
    await waitFor(() => expect(menuItem(SETTINGS).getAttribute('aria-expanded')).toBe('false'));
  });
});
