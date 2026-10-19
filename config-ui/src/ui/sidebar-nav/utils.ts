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

import { cloneElement, isValidElement, type ReactNode } from 'react';

import { NAV_ITEM_KIND } from '@/ui/constants';
import type { NavItem } from '@/ui/types';

import type { RouteNavItem } from './types';

const isDivider = (item: NavItem) => item.kind === NAV_ITEM_KIND.DIVIDER;

const dropMisplacedDividers = (items: NavItem[]) =>
  items.filter(
    (item, index) => !isDivider(item) || (index > 0 && index < items.length - 1 && !isDivider(items[index - 1])),
  );

export const visibleItems = (items: NavItem[]): NavItem[] =>
  dropMisplacedDividers(
    items
      .filter((item) => item.kind === NAV_ITEM_KIND.DIVIDER || item.visible !== false)
      .map((item) =>
        item.kind === NAV_ITEM_KIND.ROUTE && item.children ? { ...item, children: visibleItems(item.children) } : item,
      ),
  );

export const hasChildren = (item: RouteNavItem): item is RouteNavItem & { children: NavItem[] } =>
  item.children !== undefined && item.children.length > 0;

const matchesPath = (activePath: string, path: string) =>
  activePath === path || activePath.startsWith(path.endsWith('/') ? path : `${path}/`);

const matchedLength = (leaf: RouteNavItem, activePath: string) =>
  Math.max(
    -1,
    ...[leaf.path, ...(leaf.matchPaths ?? [])]
      .filter((path) => matchesPath(activePath, path))
      .map((path) => path.length),
  );

const leaves = (items: NavItem[]): RouteNavItem[] =>
  items.flatMap((item) => {
    if (item.kind !== NAV_ITEM_KIND.ROUTE) return [];
    return hasChildren(item) ? leaves(item.children) : [item];
  });

export const findActiveKey = (items: NavItem[], activePath: string): string | undefined =>
  leaves(items)
    .map((leaf) => ({ leaf, length: matchedLength(leaf, activePath) }))
    .filter(({ length }) => length >= 0)
    .sort((a, b) => b.length - a.length)[0]?.leaf.key;

const containsKey = (item: RouteNavItem, key: string | undefined): boolean =>
  key !== undefined && hasChildren(item) && leaves(item.children).some((leaf) => leaf.key === key);

export const openGroupKeys = (items: NavItem[], activeKey: string | undefined): string[] =>
  items.flatMap((item) => (item.kind === NAV_ITEM_KIND.ROUTE && containsKey(item, activeKey) ? [item.key] : []));

export const navTargets = (items: NavItem[]): Map<string, NavItem> =>
  new Map(
    items.flatMap((item): [string, NavItem][] => {
      if (item.kind === NAV_ITEM_KIND.DIVIDER) return [];
      if (item.kind === NAV_ITEM_KIND.ROUTE && hasChildren(item)) return [...navTargets(item.children)];
      return [[item.key, item]];
    }),
  );

export const decorativeIcon = (icon: ReactNode): ReactNode =>
  isValidElement<{ 'aria-hidden'?: boolean }>(icon) ? cloneElement(icon, { 'aria-hidden': true }) : icon;
