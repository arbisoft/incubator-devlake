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

import type { ThemeConfig } from 'antd';

import type { ShadowTokens, SidebarTokens } from '@/theme/scales';

import { INITIALS_LENGTH } from './constants';

export const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS_LENGTH)
    .map((part) => part[0].toUpperCase())
    .join('');

export const getMenuTheme = (sidebar: SidebarTokens, shadow: ShadowTokens): ThemeConfig => ({
  token: {
    colorBgElevated: sidebar.bg,
    boxShadowSecondary: `0 0 0 1px ${sidebar.divider}, ${shadow.flyout}`,
    colorText: sidebar.text,
    colorTextDescription: sidebar.textMuted,
    colorTextDisabled: sidebar.textMuted,
    colorSplit: sidebar.divider,
    controlItemBgHover: sidebar.itemHoverBg,
  },
});
