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

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getTheme } from '@/theme/tokens';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { METER_SIZE, METER_TONE } from './constants';
import { SegmentedMeter } from './segmented-meter';
import { clampFilled, getMeterTone } from './utils';

const LABEL = '2 of 3 signals available';
const { colors, layout } = getTheme('light');

const normaliseColor = (value: string) => {
  const probe = document.createElement('span');
  probe.style.color = value;
  return probe.style.color;
};

const segments = () => Array.from(screen.getByRole('img', { name: LABEL }).children) as HTMLElement[];

describe('getMeterTone', () => {
  it.each([
    [0, 3, METER_TONE.NONE],
    [1, 3, METER_TONE.PARTIAL],
    [2, 3, METER_TONE.PARTIAL],
    [3, 3, METER_TONE.COMPLETE],
    [5, 3, METER_TONE.COMPLETE],
    [-1, 3, METER_TONE.NONE],
    [0, 0, METER_TONE.NONE],
  ])('maps %i of %i to %s', (filled, total, tone) => {
    expect(getMeterTone(filled, total)).toBe(tone);
  });
});

describe('clampFilled', () => {
  it('keeps the count between zero and the total', () => {
    expect(clampFilled(7, 3)).toBe(3);
    expect(clampFilled(-2, 3)).toBe(0);
    expect(clampFilled(1.9, 3)).toBe(1);
  });
});

describe('SegmentedMeter', () => {
  it('exposes the caller label and draws one segment per total', () => {
    renderWithTheme(<SegmentedMeter total={3} filled={2} size={METER_SIZE.SM} label={LABEL} />);
    expect(segments()).toHaveLength(3);
  });

  it('colours filled segments with the tone and the rest with the border', () => {
    renderWithTheme(<SegmentedMeter total={3} filled={2} size={METER_SIZE.SM} label={LABEL} />);
    const [first, second, third] = segments().map((node) => getComputedStyle(node).backgroundColor);
    expect(first).toBe(normaliseColor(colors.warningText));
    expect(second).toBe(normaliseColor(colors.warningText));
    expect(third).toBe(normaliseColor(colors.border));
  });

  it('uses the success colour when complete', () => {
    renderWithTheme(<SegmentedMeter total={3} filled={3} size={METER_SIZE.SM} label={LABEL} />);
    expect(getComputedStyle(segments()[2]).backgroundColor).toBe(normaliseColor(colors.successText));
  });

  it('leaves every segment empty when nothing is filled', () => {
    renderWithTheme(<SegmentedMeter total={3} filled={0} size={METER_SIZE.SM} label={LABEL} />);
    segments().forEach((node) => expect(getComputedStyle(node).backgroundColor).toBe(normaliseColor(colors.border)));
  });

  it.each([METER_SIZE.SM, METER_SIZE.MD])('sizes the %s segments from the layout tokens', (size) => {
    renderWithTheme(<SegmentedMeter total={3} filled={1} size={size} label={LABEL} />);
    const style = getComputedStyle(segments()[0]);
    expect(style.width).toBe(`${layout.meterSegment[size].width}px`);
    expect(style.height).toBe(`${layout.meterSegment[size].height}px`);
  });
});
