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

import { textStyle } from '@/ui/style-helpers';

import { METRIC_TILE_TONE } from './constants';
import type { MetricTileTone } from './types';

type ToneProps = { $tone: MetricTileTone };

const onBrand = ({ $tone }: ToneProps) => $tone === METRIC_TILE_TONE.ON_BRAND;

export const Tile = styled.dl<ToneProps>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $tone }) => (onBrand({ $tone }) ? 0 : theme.space.xs)}px;
  min-width: 0;
  margin: 0;
  padding: ${({ theme, $tone }) => (onBrand({ $tone }) ? 0 : theme.space.md)}px;
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
  color: ${({ theme, $tone }) => (onBrand({ $tone }) ? theme.sidebar.text : theme.colors.text)};
`;

export const Hint = styled.dd<ToneProps>`
  ${textStyle('caption')}
  order: 3;
  margin: 0;
  color: ${({ theme, $tone }) => (onBrand({ $tone }) ? theme.sidebar.textMuted : theme.colors.textSecondary)};
`;
