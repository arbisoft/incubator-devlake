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

import { generate } from '@ant-design/colors';
import type { ThemeConfig } from 'antd';

import { buildAntdConfig } from './antd-config';
import { PALETTE } from './palette';
import {
  buildShadow,
  LAYOUT,
  MOTION,
  RADIUS,
  SPACE,
  TYPOGRAPHY,
  Z_INDEX,
  type BrandTokens,
  type LayoutTokens,
  type MotionTokens,
  type RadiusTokens,
  type ShadowTokens,
  type SidebarTokens,
  type SpaceTokens,
  type TypographyTokens,
  type ZIndexTokens,
} from './scales';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const primaryShades = {
  lightest: '#DBE4FD',
  lighter: '#BDCEFB',
  light: '#99B3F9',
  base: '#7497F7',
  dark: '#5D7CD2',
  darker: '#4C66AD',
  darkest: '#3C5088',
  tint100: '#F0F4FE',
};

type BaseThemeColors = {
  // Brand
  primary: string;
  primaryHover: string;

  // Status / accent
  success: string;
  successBg: string;
  error: string;
  errorAlt: string;
  errorMuted: string;
  errorBg: string;
  warning: string;
  warningAlt: string;
  warningSoft: string;
  secondary: string;
  infoBg: string;

  // Surfaces
  bgLayout: string;
  bgContainer: string;
  bgElevated: string;
  bgHover: string;
  bgMuted: string;
  bgCode: string;
  bgStatus: string;

  // Borders
  border: string;
  borderSubtle: string;
  borderTask: string;
  borderStep: string;

  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textBody: string;
  textFaint: string;
  textInverse: string;
  textDisabled: string;
};

export interface AppTheme {
  mode: ResolvedTheme;
  colors: AppThemeColors;
  brand: BrandTokens;
  sidebar: SidebarTokens;
  typography: TypographyTokens;
  space: SpaceTokens;
  radius: RadiusTokens;
  shadow: ShadowTokens;
  layout: LayoutTokens;
  zIndex: ZIndexTokens;
  motion: MotionTokens;
  antd: ThemeConfig;
}

const lightColors: BaseThemeColors = {
  primary: primaryShades.base,
  primaryHover: primaryShades.dark,

  success: '#4DB764',
  successBg: '#EDFBF0',
  error: '#F5222D',
  errorAlt: '#E34040',
  errorMuted: '#CD4246',
  errorBg: '#FEEFEF',
  warning: '#F5A623',
  warningAlt: '#FAAD14',
  warningSoft: '#F4BE55',
  secondary: '#FF8B8B',
  infoBg: '#E9EFFF',

  bgLayout: '#F9F9FA',
  bgContainer: '#FFFFFF',
  bgElevated: '#F3F3F3',
  bgHover: '#EEEEEE',
  bgMuted: '#EFEFEF',
  bgCode: '#F5F5F5',
  bgStatus: '#F9F9FA',

  border: '#DBDCDF',
  borderSubtle: '#F0F0F0',
  borderTask: '#DBE4FD',
  borderStep: 'rgba(0, 0, 0, 0.25)',

  text: '#292B3F',
  textSecondary: '#4D4E5F',
  textTertiary: '#94959F',
  textMuted: '#70727F',
  textBody: '#6C6C6C',
  textFaint: '#AAAAAA',
  textInverse: '#FFFFFF',
  textDisabled: 'rgba(0, 0, 0, 0.25)',
};

const darkColors: BaseThemeColors = {
  primary: primaryShades.base,
  primaryHover: primaryShades.lighter,

  success: '#4DB764',
  successBg: 'rgba(77, 183, 100, 0.15)',
  error: '#F5222D',
  errorAlt: '#FF6B6B',
  errorMuted: '#FF8080',
  errorBg: 'rgba(245, 34, 45, 0.15)',
  warning: '#F5A623',
  warningAlt: '#FAAD14',
  warningSoft: '#F4BE55',
  secondary: '#FF8B8B',
  infoBg: primaryShades.darkest,

  bgLayout: '#1B1B1D',
  bgContainer: '#242526',
  bgElevated: '#2D2D2F',
  bgHover: '#303032',
  bgMuted: '#2D2D2F',
  bgCode: '#2D2D2F',
  bgStatus: '#2D2D2F',

  border: '#3A3A3C',
  borderSubtle: '#2D2D2F',
  borderTask: primaryShades.darkest,
  borderStep: '#3A3A3C',

  text: '#E3E3E6',
  textSecondary: '#BDCEFB',
  textTertiary: '#94959F',
  textMuted: '#A0A1A8',
  textBody: '#A0A1A8',
  textFaint: '#70727F',
  textInverse: '#1B1B1D',
  textDisabled: '#70727F',
};

// ---- Fork tokens (reskin, plan 4.2). Upstream colour objects above stay untouched; values below override them. ----

type ForkThemeColors = {
  link: string;
  iconBrand: string;
  focusRing: string;
  primarySubtle: string;
  selectedBg: string;
  onSelected: string;
  bgTableHeader: string;
  primaryActive: string;
  errorActive: string;
  successText: string;
  warningText: string;
  infoText: string;
  warningBg: string;
  infoTintBg: string;
};

export type AppThemeColors = BaseThemeColors & ForkThemeColors;

const SHADE_HOVER_INDEX = 4;
const SHADE_ACTIVE_INDEX = 6;

export const deriveShades = (base: string): { hover: string; active: string } => {
  const shades = generate(base);
  return { hover: shades[SHADE_HOVER_INDEX], active: shades[SHADE_ACTIVE_INDEX] };
};

const withBrandOverride = (colors: AppThemeColors, custom: string): AppThemeColors => {
  const { hover, active } = deriveShades(custom);
  return {
    ...colors,
    primary: custom,
    link: custom,
    focusRing: custom,
    iconBrand: custom,
    primaryHover: hover,
    primaryActive: active,
  };
};

const buildTheme = (mode: ResolvedTheme, customPrimary?: string): AppTheme => {
  const palette = PALETTE[mode];
  const base = mode === 'dark' ? darkColors : lightColors;
  const merged: AppThemeColors = { ...base, ...palette.colors };
  const colors = customPrimary ? withBrandOverride(merged, customPrimary) : merged;
  const { sidebar } = palette;
  const shadow = buildShadow(mode);
  return {
    mode,
    colors,
    brand: palette.brand,
    sidebar,
    typography: TYPOGRAPHY,
    space: SPACE,
    radius: RADIUS,
    shadow,
    layout: LAYOUT,
    zIndex: Z_INDEX,
    motion: MOTION,
    antd: buildAntdConfig(colors, mode, sidebar, shadow),
  };
};

export const getTheme = (mode: ResolvedTheme, customPrimary?: string): AppTheme => buildTheme(mode, customPrimary);
