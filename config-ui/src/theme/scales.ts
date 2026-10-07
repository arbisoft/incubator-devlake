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

import { theme as antdTheme } from 'antd';

import type { ResolvedTheme } from './tokens';

export type BrandTokens = { onPrimary: string };

export type SidebarTokens = {
  bg: string;
  divider: string;
  text: string;
  icon: string;
  textMuted: string;
  itemHoverBg: string;
  itemActiveBg: string;
  itemActiveText: string;
  logoFilter: string;
  markBg: string;
};

type TypographyStyle = { fontSize: number; lineHeight: number; fontWeight: number; letterSpacing: number };
type TypographyKey = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMedium' | 'bodyLarge' | 'caption' | 'captionStrong';
export type TypographyTokens = {
  fontFamily: string;
  monoFamily: string;
  scale: Record<TypographyKey, TypographyStyle>;
};

export type SpaceTokens = { xxs: number; xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
export type RadiusTokens = { sm: number; md: number; lg: number; pill: number };
export type ShadowTokens = {
  buttonPrimary: string;
  buttonSecondary: string;
  segmentSelected: string;
  flyout: string;
  popover: string;
};
export type LayoutTokens = {
  sidebarWidth: number;
  sidebarRailWidth: number;
  drawerWidth: number;
  contentGutter: number;
  pageFooterHeight: number;
  breakpointTablet: number;
  focusRingWidth: number;
  keyValueLabelWidth: number;
  emptyStateTextWidth: number;
  searchMaxWidth: number;
  connectionNameWidth: number;
  sortSelectWidth: number;
  statusDotSize: number;
  sidebarHeaderHeight: number;
  sidebarControlSize: number;
  railItemWidth: number;
  navIconSize: number;
  railIconSize: number;
  avatarSize: number;
  markTileSize: number;
  wordmarkWidth: number;
  confirmModalWidth: number;
  pipelineTaskHeight: number;
  pipelineTaskDurationWidth: number;
  catalogCardMinWidth: number;
  segmentInset: number;
  segmentPaddingBlock: number;
  segmentPaddingInline: number;
  modalWidth: { sm: number; md: number; lg: number };
  modalViewportMargin: number;
};
export type ZIndexTokens = { sidebar: number; flyout: number; drawer: number; modal: number };
export type MotionTokens = { fast: number; base: number; easing: string };

const FONT_FAMILY = '"Figtree", -apple-system, "Segoe UI", sans-serif';
const MONO_FAMILY = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

export const WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

export const TYPOGRAPHY: TypographyTokens = {
  fontFamily: FONT_FAMILY,
  monoFamily: MONO_FAMILY,
  scale: {
    display: { fontSize: 30, lineHeight: 36, fontWeight: WEIGHT.semibold, letterSpacing: -0.6 },
    h1: { fontSize: 24, lineHeight: 32, fontWeight: WEIGHT.bold, letterSpacing: -0.4 },
    h2: { fontSize: 20, lineHeight: 28, fontWeight: WEIGHT.semibold, letterSpacing: -0.2 },
    h3: { fontSize: 16, lineHeight: 24, fontWeight: WEIGHT.semibold, letterSpacing: 0 },
    body: { fontSize: 14, lineHeight: 22, fontWeight: WEIGHT.regular, letterSpacing: 0 },
    bodyMedium: { fontSize: 14, lineHeight: 22, fontWeight: WEIGHT.medium, letterSpacing: 0 },
    bodyLarge: { fontSize: 15, lineHeight: 22, fontWeight: WEIGHT.regular, letterSpacing: 0 },
    caption: { fontSize: 12, lineHeight: 18, fontWeight: WEIGHT.regular, letterSpacing: 0 },
    captionStrong: { fontSize: 12, lineHeight: 18, fontWeight: WEIGHT.semibold, letterSpacing: 0 },
  },
};

export const SPACE: SpaceTokens = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 };

export const RADIUS: RadiusTokens = { sm: 4, md: 6, lg: 8, pill: 999 };

export const LAYOUT: LayoutTokens = {
  sidebarWidth: 240,
  sidebarRailWidth: 72,
  drawerWidth: 600,
  contentGutter: SPACE.xl,
  pageFooterHeight: 58,
  breakpointTablet: 1024,
  focusRingWidth: 2,
  keyValueLabelWidth: 112,
  emptyStateTextWidth: 452,
  searchMaxWidth: 400,
  connectionNameWidth: 200,
  sortSelectWidth: 168,
  statusDotSize: 6,
  sidebarHeaderHeight: 70,
  sidebarControlSize: 28,
  railItemWidth: 48,
  navIconSize: 14,
  railIconSize: 18,
  avatarSize: 32,
  markTileSize: 32,
  wordmarkWidth: 120,
  confirmModalWidth: 416,
  pipelineTaskHeight: 80,
  pipelineTaskDurationWidth: 80,
  catalogCardMinWidth: 272,
  segmentInset: 2,
  segmentPaddingBlock: 3,
  segmentPaddingInline: 11,
  modalWidth: { sm: 520, md: 600, lg: 800 },
  modalViewportMargin: 40,
};

// antd's popup layer is 1000 (modal, drawer); dropdowns 1050; the sidebar sits below them.
export const Z_INDEX: ZIndexTokens = { sidebar: 100, flyout: 900, drawer: 1000, modal: 1000 };

export const CONTROL_HEIGHT = { sm: 24, md: 32, lg: 40 } as const;

export const MOTION: MotionTokens = { fast: 120, base: 200, easing: 'ease-out' };

export const buildShadow = (mode: ResolvedTheme): ShadowTokens => ({
  buttonPrimary: '0 2px 0 rgba(0, 0, 0, 0.043)',
  buttonSecondary: '0 2px 0 rgba(0, 0, 0, 0.016)',
  segmentSelected: '0 2px 8px rgba(0, 0, 0, 0.05)',
  flyout: '0 6px 16px rgba(0, 0, 0, 0.24)',
  popover: antdTheme.getDesignToken({
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  }).boxShadowSecondary,
});
