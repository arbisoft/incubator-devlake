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

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { NAV_ITEM_KIND } from '@/ui/constants';
import type { NavItem } from '@/ui/types';

import { decorativeIcon, findActiveKey, navTargets, openGroupKeys, visibleItems } from './utils';

const route = (key: string, path: string, extra: Partial<Extract<NavItem, { kind: 'route' }>> = {}): NavItem => ({
  kind: NAV_ITEM_KIND.ROUTE,
  key,
  label: key,
  icon: null,
  path,
  ...extra,
});

const ITEMS: NavItem[] = [
  route('home', '/home'),
  route('group', '/group', {
    children: [route('list', '/group/list', { matchPaths: ['/group/item/'] }), route('other', '/group/other')],
  }),
  { kind: NAV_ITEM_KIND.DIVIDER, key: 'divider' },
  { kind: NAV_ITEM_KIND.EXTERNAL, key: 'docs', label: 'Docs', icon: null, href: 'https://example.com' },
];

describe('findActiveKey', () => {
  it('matches the exact path and nested paths', () => {
    expect(findActiveKey(ITEMS, '/home')).toBe('home');
    expect(findActiveKey(ITEMS, '/home/42/edit')).toBe('home');
  });

  it('matches extra paths declared on an item', () => {
    expect(findActiveKey(ITEMS, '/group/item/7')).toBe('list');
  });

  it('prefers the longest matching path', () => {
    const items = [route('all', '/a'), route('deep', '/a/b')];
    expect(findActiveKey(items, '/a/b/c')).toBe('deep');
    expect(findActiveKey(items, '/a/z')).toBe('all');
  });

  it('returns undefined when nothing matches and ignores external items and groups', () => {
    expect(findActiveKey(ITEMS, '/elsewhere')).toBeUndefined();
    expect(findActiveKey(ITEMS, '/group')).toBeUndefined();
  });
});

describe('visibleItems and group helpers', () => {
  it('drops hidden items and dividers left without neighbours', () => {
    const items = [route('a', '/a', { visible: false }), { kind: NAV_ITEM_KIND.DIVIDER, key: 'd' } as NavItem];
    expect(visibleItems(items)).toEqual([]);
  });

  it('opens the group that holds the active item and lists navigable targets', () => {
    expect(openGroupKeys(ITEMS, 'list')).toEqual(['group']);
    expect(openGroupKeys(ITEMS, 'home')).toEqual([]);
    expect([...navTargets(ITEMS).keys()]).toEqual(['home', 'list', 'other', 'docs']);
  });
});

describe('decorativeIcon', () => {
  it('hides an icon element from assistive technology and passes other nodes through', () => {
    expect(decorativeIcon(createElement('i'))).toMatchObject({ props: { 'aria-hidden': true } });
    expect(decorativeIcon('text')).toBe('text');
    expect(decorativeIcon(null)).toBeNull();
  });
});
