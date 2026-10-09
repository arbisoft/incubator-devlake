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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { generate } from '@ant-design/colors';
import { describe, expect, it } from 'vitest';

import { PALETTE } from './palette';
import { deriveShades, getTheme, ResolvedTheme } from './tokens';

const MODES: ResolvedTheme[] = ['light', 'dark'];
const TEXT_CONTRAST = 4.5;
const UI_CONTRAST = 3;
const HEX_RADIX = 16;
const HEX_PATTERN = /#[0-9a-f]{3,8}\b/i;

type Rgb = [number, number, number];

const parseColor = (value: string): { rgb: Rgb; alpha: number } => {
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((part) => part.trim());
    return { rgb: [Number(r), Number(g), Number(b)], alpha: Number(a) };
  }
  const hex = value.replace('#', '');
  const channel = (i: number) => parseInt(hex.slice(i, i + 2), HEX_RADIX);
  return { rgb: [channel(0), channel(2), channel(4)], alpha: 1 };
};

const composite = (fg: string, bg: string): Rgb => {
  const { rgb, alpha } = parseColor(fg);
  const base = parseColor(bg).rgb;
  return rgb.map((c, i) => c * alpha + base[i] * (1 - alpha)) as Rgb;
};

const luminance = ([r, g, b]: Rgb) => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (fg: string, bg: string) => {
  const a = luminance(composite(fg, bg));
  const b = luminance(parseColor(bg).rgb);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const keyPaths = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
};

describe('theme tokens', () => {
  it('defines the same keys in light and dark, including nested scales', () => {
    expect(keyPaths(getTheme('dark')).sort()).toEqual(keyPaths(getTheme('light')).sort());
  });

  it.each(MODES)('%s: every palette colour reaches the resolved theme', (mode) => {
    const theme = getTheme(mode);
    expect(theme.colors).toMatchObject(PALETTE[mode].colors);
    expect(theme.sidebar).toEqual(PALETTE[mode].sidebar);
    expect(theme.brand).toEqual(PALETTE[mode].brand);
  });

  it.each(MODES)('%s: contrast pairs meet WCAG AA', (mode) => {
    const { colors, sidebar, brand } = getTheme(mode);
    const textPairs: [string, string, string][] = [
      ['text/bgLayout', colors.text, colors.bgLayout],
      ['text/bgContainer', colors.text, colors.bgContainer],
      ['textSecondary/bgLayout', colors.textSecondary, colors.bgLayout],
      ['textSecondary/bgContainer', colors.textSecondary, colors.bgContainer],
      ['textSecondary/bgTableHeader', colors.textSecondary, colors.bgTableHeader],
      ['link/bgLayout', colors.link, colors.bgLayout],
      ['errorActive/bgLayout', colors.errorActive, colors.bgLayout],
      ['errorActive/bgContainer', colors.errorActive, colors.bgContainer],
      ['successText/bgContainer', colors.successText, colors.bgContainer],
      ['warningText/bgContainer', colors.warningText, colors.bgContainer],
      ['warningText/warningBg', colors.warningText, colors.warningBg],
      ['infoText/bgContainer', colors.infoText, colors.bgContainer],
      ['infoText/infoTintBg', colors.infoText, colors.infoTintBg],
      ['onPrimary/primary', brand.onPrimary, colors.primary],
      ['onSelected/selectedBg', colors.onSelected, colors.selectedBg],
      ['sidebar.text/sidebar.bg', sidebar.text, sidebar.bg],
      ['sidebar.textMuted/sidebar.bg', sidebar.textMuted, sidebar.bg],
      ['sidebar.itemActiveText/sidebar.itemActiveBg', sidebar.itemActiveText, sidebar.itemActiveBg],
    ];
    const uiPairs: [string, string, string][] = [
      ['focusRing/bgLayout', colors.focusRing, colors.bgLayout],
      ['primary/bgLayout', colors.primary, colors.bgLayout],
    ];
    for (const [name, fg, bg] of textPairs) {
      expect({ name, ratio: contrast(fg, bg) >= TEXT_CONTRAST }).toEqual({ name, ratio: true });
    }
    for (const [name, fg, bg] of uiPairs) {
      expect({ name, ratio: contrast(fg, bg) >= UI_CONTRAST }).toEqual({ name, ratio: true });
    }
  });

  it('keeps the default light hover and active shades in line with generate()', () => {
    const { colors } = getTheme('light');
    const shades = deriveShades(colors.primary);
    expect(colors.primaryHover.toLowerCase()).toBe(shades.hover.toLowerCase());
    expect(colors.primaryActive.toLowerCase()).toBe(shades.active.toLowerCase());
  });

  it.each(MODES)('%s: custom primary replaces the brand colours and derives hover and active', (mode) => {
    const custom = '#1677ff';
    const base = getTheme(mode).colors;
    const { colors } = getTheme(mode, custom);
    const shades = generate(custom);
    expect([colors.primary, colors.link, colors.focusRing, colors.iconBrand]).toEqual([custom, custom, custom, custom]);
    expect(colors.primaryHover).toBe(shades[4]);
    expect(colors.primaryActive).toBe(shades[6]);
    expect(colors.text).toBe(base.text);
    expect(colors.selectedBg).toBe(base.selectedBg);
  });

  it('feeds the antd config from the same values', () => {
    const theme = getTheme('light');
    expect(theme.antd.token?.fontFamily).toBe(theme.typography.fontFamily);
    expect(theme.antd.token?.colorLink).toBe(theme.colors.link);
    expect(theme.antd.token?.borderRadius).toBe(theme.radius.md);
    expect(theme.antd.token?.colorErrorText).toBe(theme.colors.errorActive);
    expect(theme.antd.components?.Menu?.darkItemBg).toBe(theme.sidebar.bg);
    expect(getTheme('light', '#1677ff').antd.token?.colorPrimary).toBe('#1677ff');
  });
});

describe('index.css', () => {
  const indexCss = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
  const normalized = indexCss.replace(/\s+/g, ' ');

  it('declares a swap @font-face for each Figtree weight', () => {
    for (const weight of [400, 500, 600, 700]) {
      expect(normalized).toContain(
        `font-weight: ${weight}; font-display: swap; src: url('./fonts/figtree-latin-${weight}-normal.woff2')`,
      );
    }
  });

  it('uses the Figtree stack from the theme tokens', () => {
    const stack = getTheme('light').typography.fontFamily.replace(/"/g, "'").replace(/,\s*/g, ', ');
    expect(normalized.replace(/\(\s+/g, '(').replace(/,\s*/g, ', ')).toContain(stack);
  });

  it('holds no colour literals', () => {
    expect(indexCss).not.toMatch(HEX_PATTERN);
    expect(indexCss).not.toMatch(/rgba?\(|hsla?\(/);
  });
});
