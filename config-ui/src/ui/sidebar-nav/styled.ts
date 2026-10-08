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

import { ExportOutlined } from '@ant-design/icons';
import styled from 'styled-components';

import { focusRingStyle, motionTransition, visuallyHidden } from '@/ui/style-helpers';

export const HiddenHint = styled.span`
  ${visuallyHidden}
`;

export const ExternalIcon = styled(ExportOutlined)`
  margin-inline-start: ${({ theme }) => theme.space.xs}px;
`;

export const Root = styled.aside<{ $collapsed: boolean }>`
  position: relative;
  z-index: ${({ theme }) => theme.zIndex.sidebar};
  display: flex;
  flex: none;
  flex-direction: column;
  width: ${({ theme, $collapsed }) => ($collapsed ? theme.layout.sidebarRailWidth : theme.layout.sidebarWidth)}px;
  height: 100%;
  color: ${({ theme }) => theme.sidebar.text};
  background: ${({ theme }) => theme.sidebar.bg};
  ${motionTransition('width')}
`;

export const HeaderRow = styled.div<{ $collapsed: boolean }>`
  display: flex;
  flex: none;
  flex-direction: ${({ $collapsed }) => ($collapsed ? 'column' : 'row')};
  align-items: center;
  justify-content: space-between;
  padding-right: ${({ theme, $collapsed }) => ($collapsed ? 0 : theme.space.sm)}px;
`;

export const HeaderSlot = styled.div`
  flex: 1;
  min-width: 0;
  width: 100%;
`;

export const Toggle = styled.button<{ $collapsed: boolean }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: ${({ theme }) => theme.layout.sidebarControlSize}px;
  height: ${({ theme }) => theme.layout.sidebarControlSize}px;
  margin-block: ${({ theme, $collapsed }) => ($collapsed ? theme.space.xxs : 0)}px;
  color: ${({ theme }) => theme.sidebar.text};
  font-size: ${({ theme }) => theme.layout.navIconSize}px;
  background: ${({ theme }) => theme.sidebar.itemHoverBg};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md}px;
  cursor: pointer;

  &:focus-visible {
    ${focusRingStyle}
  }
`;

export const MenuFrame = styled.div`
  flex: 1;
  min-height: 0;
  padding-block: ${({ theme }) => theme.space.xs}px;
  overflow-x: hidden;
  overflow-y: auto;

  .ant-menu {
    background: transparent;
    border-inline-end: 0;
  }

  .ant-menu-inline-collapsed {
    width: 100%;
  }

  .ant-menu-item a {
    color: inherit;

    &::after {
      position: absolute;
      inset: 0;
      content: '';
    }
  }

  .ant-menu-inline .ant-menu-submenu-selected > .ant-menu-submenu-title {
    color: ${({ theme }) => theme.sidebar.text};
  }

  .ant-menu-inline-collapsed .ant-menu-submenu-selected > .ant-menu-submenu-title {
    color: ${({ theme }) => theme.sidebar.itemActiveText};
    background: ${({ theme }) => theme.sidebar.itemActiveBg};

    .ant-menu-item-icon {
      color: ${({ theme }) => theme.sidebar.itemActiveText};
      transition-property: font-size, margin;
    }
  }

  .ant-menu-item-divider {
    background: ${({ theme }) => theme.sidebar.divider};
  }

  .ant-menu-item a:focus-visible {
    outline: none;
  }

  .ant-menu:focus-visible {
    outline: none;
  }

  .ant-menu:focus-visible .ant-menu-item-active,
  .ant-menu:focus-visible .ant-menu-submenu-active > .ant-menu-submenu-title,
  .ant-menu-item:focus-visible,
  .ant-menu-item:has(a:focus-visible),
  .ant-menu-submenu-title:focus-visible {
    ${focusRingStyle}
    outline-offset: -${({ theme }) => theme.layout.focusRingWidth}px;
  }
`;

export const Footer = styled.div`
  flex: none;
  padding: ${({ theme }) => theme.space.xs}px ${({ theme }) => theme.space.sm}px ${({ theme }) => theme.space.md}px;
  border-top: 1px solid ${({ theme }) => theme.sidebar.divider};
`;
