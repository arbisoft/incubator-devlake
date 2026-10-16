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

import styled from 'styled-components';

import type { AppThemeColors } from '@/theme/tokens';
import { textStyle } from '@/ui/style-helpers';

import { METRIC_TILE_TONE } from './constants';
import type { MetricTileTone } from './types';

type ToneProps = { $tone: MetricTileTone };
type TileProps = ToneProps & { $bordered: boolean };

type TonePalette = { value: keyof AppThemeColors; border: keyof AppThemeColors; bg: keyof AppThemeColors };

const DEFAULT_PALETTE: TonePalette = { value: 'text', border: 'borderSubtle', bg: 'bgContainer' };

const TONE_PALETTE: Partial<Record<MetricTileTone, TonePalette>> = {
  [METRIC_TILE_TONE.WARNING]: { value: 'warningText', border: 'warning', bg: 'warningBg' },
  [METRIC_TILE_TONE.DANGER]: { value: 'error', border: 'error', bg: 'errorBg' },
};

const palette = ({ $tone }: ToneProps) => TONE_PALETTE[$tone] ?? DEFAULT_PALETTE;

const onBrand = ({ $tone }: ToneProps) => $tone === METRIC_TILE_TONE.ON_BRAND;

export const Tile = styled.dl<TileProps>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $tone }) => (onBrand({ $tone }) ? 0 : theme.space.xs)}px;
  min-width: 0;
  margin: 0;
  padding: ${({ theme, $tone }) => (onBrand({ $tone }) ? 0 : theme.space.md)}px;
  border: ${({ $bordered }) => ($bordered ? 1 : 0)}px solid ${(props) => props.theme.colors[palette(props).border]};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background: ${(props) => (props.$bordered ? props.theme.colors[palette(props).bg] : 'transparent')};
`;

export const Label = styled.dt<ToneProps>`
  ${textStyle('caption')}
  order: ${(props) => (onBrand(props) ? 2 : 0)};
  color: ${({ theme, $tone }) => (onBrand({ $tone }) ? theme.sidebar.textMuted : theme.colors.textSecondary)};
`;

export const Value = styled.dd<ToneProps>`
  ${(props) => textStyle(onBrand(props) ? 'h1' : 'display')(props)}
  order: ${(props) => (onBrand(props) ? 1 : 0)};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${(props) => (onBrand(props) ? props.theme.sidebar.text : props.theme.colors[palette(props).value])};
`;

export const Hint = styled.dd<ToneProps>`
  ${textStyle('caption')}
  order: 3;
  margin: 0;
  color: ${({ theme, $tone }) => (onBrand({ $tone }) ? theme.sidebar.textMuted : theme.colors.textSecondary)};
`;
