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

import type { MenuProps } from 'antd';
import { Link } from 'react-router-dom';

import { COMMON_COPY, NAV_ITEM_KIND } from '@/ui/constants';
import type { NavItem } from '@/ui/types';

import { ExternalIcon, HiddenHint } from './styled';
import { hasChildren } from './utils';

type MenuItems = NonNullable<MenuProps['items']>;

export const toMenuItems = (items: NavItem[], collapsed: boolean): MenuItems =>
  items.map((item): MenuItems[number] => {
    if (item.kind === NAV_ITEM_KIND.DIVIDER) return { type: 'divider', key: item.key };
    if (item.kind === NAV_ITEM_KIND.EXTERNAL) {
      return {
        key: item.key,
        icon: item.icon,
        title: item.label,
        label: (
          <a href={item.href} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
            {item.label}
            <ExternalIcon aria-hidden />
            <HiddenHint>{COMMON_COPY.opensInNewTab}</HiddenHint>
          </a>
        ),
      };
    }
    if (hasChildren(item)) {
      return {
        key: item.key,
        icon: item.icon,
        label: item.label,
        title: item.label,
        children: collapsed
          ? [
              {
                type: 'group',
                key: `${item.key}-group`,
                label: item.label,
                children: toMenuItems(item.children, collapsed),
              },
            ]
          : toMenuItems(item.children, collapsed),
      };
    }
    return {
      key: item.key,
      icon: item.icon,
      title: item.label,
      label: (
        <Link to={item.path} tabIndex={-1}>
          {item.label}
        </Link>
      ),
    };
  });
