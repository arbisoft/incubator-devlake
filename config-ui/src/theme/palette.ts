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

// Pure token values with no imports, so unit tests and e2e specs can import this file by relative path.

const WHITE = '#FFFFFF';
const SIDEBAR_BG_LIGHT = '#1E1A40';
const SELECTED_BG_LIGHT = '#D1CCFF';
const SELECTED_BG_DARK = '#352F6A';
const SIDEBAR_TEXT_MUTED = 'rgba(255, 255, 255, 0.65)';
const SIDEBAR_ITEM_HOVER_BG = 'rgba(255, 255, 255, 0.08)';

export const PALETTE = {
  light: {
    brand: { onPrimary: WHITE },
    colors: {
      primary: '#473D99',
      primaryHover: '#685DA6',
      primaryActive: '#2E2873',
      link: '#473D99',
      primarySubtle: '#FAFAFF',
      selectedBg: SELECTED_BG_LIGHT,
      onSelected: SIDEBAR_BG_LIGHT,
      focusRing: '#685DA6',
      iconBrand: '#473D99',
      text: '#141414',
      textSecondary: '#6E6E6E',
      textDisabled: '#BFBFBF',
      border: '#D9D9D9',
      borderSubtle: '#F0F0F0',
      bgLayout: WHITE,
      bgContainer: WHITE,
      bgTableHeader: '#FAFAFA',
      error: '#F5222D',
      errorActive: '#CF1322',
      infoBg: '#E6F7FF',
    },
    sidebar: {
      bg: SIDEBAR_BG_LIGHT,
      divider: '#332E5C',
      text: WHITE,
      icon: WHITE,
      textMuted: SIDEBAR_TEXT_MUTED,
      itemHoverBg: SIDEBAR_ITEM_HOVER_BG,
      itemActiveBg: SELECTED_BG_LIGHT,
      itemActiveText: SIDEBAR_BG_LIGHT,
    },
  },
  dark: {
    brand: { onPrimary: WHITE },
    colors: {
      primary: '#685DA6',
      primaryHover: '#8A81B3',
      primaryActive: '#605697',
      link: '#9D93E0',
      primarySubtle: '#1B192C',
      selectedBg: SELECTED_BG_DARK,
      onSelected: WHITE,
      focusRing: '#9D93E0',
      iconBrand: '#9D93E0',
      text: '#E3E3E6',
      textSecondary: '#A0A1A8',
      textDisabled: '#70727F',
      border: '#3A3A3C',
      borderSubtle: '#2D2D2F',
      bgLayout: '#1B1B1D',
      bgContainer: '#242526',
      bgTableHeader: '#2D2D2F',
      error: '#FF4D4F',
      errorActive: '#FF7875',
    },
    sidebar: {
      bg: '#141225',
      divider: '#2B2650',
      text: WHITE,
      icon: WHITE,
      textMuted: SIDEBAR_TEXT_MUTED,
      itemHoverBg: SIDEBAR_ITEM_HOVER_BG,
      itemActiveBg: SELECTED_BG_DARK,
      itemActiveText: WHITE,
    },
  },
} as const;
