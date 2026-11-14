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

import { describe, expect, it } from 'vitest';

import { CONNECTOR_BRAND_COLORS, PALETTE } from './palette';

const MIN_CONTRAST = 3;

const channel = (hex: string, start: number) => {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

const contrast = (a: string, b: string) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

const CASES = Object.entries(CONNECTOR_BRAND_COLORS).flatMap(([brand, colours]) =>
  (['light', 'dark'] as const).map((mode) => [brand, mode, colours[mode]] as const),
);

describe('CONNECTOR_BRAND_COLORS', () => {
  it.each(CASES)('keeps %s readable in %s mode', (_brand, mode, colour) => {
    expect(contrast(colour, PALETTE[mode].colors.bgContainer)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});
