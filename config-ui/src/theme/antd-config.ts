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

import { theme as antdTheme, ThemeConfig } from 'antd';

import {
  CONTROL_HEIGHT,
  LAYOUT,
  MOTION,
  RADIUS,
  SPACE,
  TYPOGRAPHY,
  WEIGHT,
  Z_INDEX,
  type ShadowTokens,
  type SidebarTokens,
} from './scales';
import type { AppThemeColors, ResolvedTheme } from './tokens';

const toSeconds = (ms: number) => `${ms / 1000}s`;

export const buildAntdConfig = (
  colors: AppThemeColors,
  mode: ResolvedTheme,
  sidebar: SidebarTokens,
  shadow: ShadowTokens,
): ThemeConfig => ({
  algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: colors.primary,
    colorPrimaryHover: colors.primaryHover,
    colorPrimaryActive: colors.primaryActive,
    colorPrimaryBg: colors.selectedBg,
    colorLink: colors.link,
    colorLinkHover: colors.primaryHover,
    colorLinkActive: colors.primaryActive,
    colorSuccess: colors.success,
    colorError: colors.error,
    colorErrorActive: colors.errorActive,
    colorErrorText: colors.errorActive,
    colorErrorTextHover: colors.errorActive,
    colorErrorTextActive: colors.errorActive,
    colorWarning: colors.warning,
    colorBgLayout: colors.bgLayout,
    colorBgContainer: colors.bgContainer,
    colorBgElevated: colors.bgElevated,
    colorBorder: colors.border,
    colorBorderSecondary: colors.borderSubtle,
    colorText: colors.text,
    colorTextSecondary: colors.textSecondary,
    colorTextTertiary: colors.textTertiary,
    colorTextDisabled: colors.textDisabled,
    controlOutline: colors.focusRing,
    lineWidthFocus: LAYOUT.focusRingWidth,
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.scale.body.fontSize,
    borderRadius: RADIUS.md,
    borderRadiusSM: RADIUS.sm,
    borderRadiusLG: RADIUS.lg,
    controlHeightSM: CONTROL_HEIGHT.sm,
    controlHeight: CONTROL_HEIGHT.md,
    controlHeightLG: CONTROL_HEIGHT.lg,
    sizeXXS: SPACE.xxs,
    sizeXS: SPACE.xs,
    sizeSM: SPACE.sm,
    sizeLG: SPACE.lg,
    sizeXL: SPACE.xl,
    sizeXXL: SPACE.xxl,
    zIndexPopupBase: Z_INDEX.modal,
    motionDurationFast: toSeconds(MOTION.fast),
    motionDurationMid: toSeconds(MOTION.base),
  },
  components: {
    Button: {
      primaryShadow: shadow.buttonPrimary,
      defaultShadow: shadow.buttonSecondary,
      dangerShadow: shadow.buttonSecondary,
      fontWeight: WEIGHT.regular,
      onlyIconSize: TYPOGRAPHY.scale.body.fontSize,
    },
    Table: {
      headerBg: colors.bgTableHeader,
      headerColor: colors.text,
      rowHoverBg: colors.primarySubtle,
      rowSelectedBg: colors.selectedBg,
      rowSelectedHoverBg: colors.selectedBg,
      cellPaddingBlock: SPACE.sm,
      borderColor: colors.borderSubtle,
    },
    Pagination: {
      borderRadius: RADIUS.md,
      colorPrimary: colors.text,
      colorPrimaryHover: colors.text,
    },
    Segmented: {
      trackBg: colors.bgTableHeader,
      itemSelectedBg: colors.bgContainer,
      itemSelectedColor: colors.primary,
    },
    Tabs: {
      cardBg: colors.bgTableHeader,
      itemColor: colors.textSecondary,
      itemHoverColor: colors.primaryHover,
      itemActiveColor: colors.primaryActive,
      itemSelectedColor: colors.primary,
      inkBarColor: colors.primary,
    },
    Menu: {
      darkItemBg: sidebar.bg,
      darkSubMenuItemBg: sidebar.bg,
      darkPopupBg: sidebar.bg,
      darkItemColor: sidebar.text,
      darkItemHoverBg: sidebar.itemHoverBg,
      darkItemSelectedBg: sidebar.itemActiveBg,
      darkItemSelectedColor: sidebar.itemActiveText,
      itemBorderRadius: RADIUS.md,
      itemHeight: CONTROL_HEIGHT.lg,
      itemMarginInline: SPACE.sm,
      itemMarginBlock: SPACE.xxs / 2,
      itemPaddingInline: SPACE.lg,
      iconSize: LAYOUT.navIconSize,
      collapsedIconSize: LAYOUT.railIconSize,
      collapsedWidth: LAYOUT.sidebarRailWidth,
      darkGroupTitleColor: sidebar.textMuted,
    },
    Modal: {
      titleFontSize: TYPOGRAPHY.scale.h3.fontSize,
      titleLineHeight: TYPOGRAPHY.scale.h3.lineHeight / TYPOGRAPHY.scale.h3.fontSize,
      borderRadiusLG: RADIUS.lg,
      contentBg: colors.bgContainer,
      headerBg: colors.bgContainer,
    },
    Input: { activeBorderColor: colors.primary, hoverBorderColor: colors.primaryHover },
    Select: { activeBorderColor: colors.primary, hoverBorderColor: colors.primaryHover },
    Tag: { borderRadiusSM: RADIUS.pill },
    Typography: {
      colorLink: colors.link,
      colorLinkHover: colors.primaryHover,
      colorLinkActive: colors.primaryActive,
    },
    Breadcrumb: { linkColor: colors.textSecondary, lastItemColor: colors.text },
  },
});
