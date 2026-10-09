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

import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Menu, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NAV_ITEM_KIND } from '@/ui/constants';

import { COPY } from './constants';
import { toMenuItems } from './menu-items';
import { Footer, HeaderRow, HeaderSlot, MenuFrame, Root, Toggle } from './styled';
import type { SidebarNavProps } from './types';
import { findActiveKey, navTargets, openGroupKeys, visibleItems } from './utils';

export const SidebarNav = ({ items, activePath, collapsed, onCollapsedChange, header, footer }: SidebarNavProps) => {
  const navigate = useNavigate();
  const visible = useMemo(() => visibleItems(items), [items]);
  const activeKey = useMemo(() => findActiveKey(visible, activePath), [visible, activePath]);
  const menuItems = useMemo(() => toMenuItems(visible, collapsed), [visible, collapsed]);
  const targets = useMemo(() => navTargets(visible), [visible]);
  const [openKeys, setOpenKeys] = useState(() => openGroupKeys(visible, activeKey));
  const [popupKeys, setPopupKeys] = useState<string[]>([]);
  const [syncedKey, setSyncedKey] = useState(activeKey);
  const toggleLabel = collapsed ? COPY.expand : COPY.collapse;

  if (activeKey !== syncedKey) {
    setSyncedKey(activeKey);
    setOpenKeys((current) => [...new Set([...current, ...openGroupKeys(visible, activeKey)])]);
  }

  return (
    <Root $collapsed={collapsed} aria-label={COPY.sidebar}>
      <HeaderRow $collapsed={collapsed}>
        <HeaderSlot>{header}</HeaderSlot>
        <Tooltip title={toggleLabel} placement="right">
          <Toggle
            type="button"
            $collapsed={collapsed}
            aria-label={toggleLabel}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? <MenuUnfoldOutlined aria-hidden /> : <MenuFoldOutlined aria-hidden />}
          </Toggle>
        </Tooltip>
      </HeaderRow>
      <MenuFrame>
        <Menu
          theme="dark"
          mode="inline"
          aria-label={COPY.navigation}
          inlineCollapsed={collapsed}
          triggerSubMenuAction="click"
          items={menuItems}
          selectedKeys={activeKey ? [activeKey] : []}
          openKeys={collapsed ? popupKeys : openKeys}
          onOpenChange={collapsed ? setPopupKeys : setOpenKeys}
          onClick={({ key, domEvent }) => {
            const target = targets.get(key);
            if (!target || (domEvent.target instanceof Element && domEvent.target.closest('a'))) return;
            if (target.kind === NAV_ITEM_KIND.ROUTE) navigate(target.path);
            if (target.kind === NAV_ITEM_KIND.EXTERNAL) window.open(target.href, '_blank', 'noopener,noreferrer');
          }}
        />
      </MenuFrame>
      <Footer>{footer}</Footer>
    </Root>
  );
};
