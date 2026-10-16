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

import styled, { type DefaultTheme } from 'styled-components';

import { METER_TONE } from './constants';
import type { MeterSize, MeterTone } from './types';

const fillColor = (theme: DefaultTheme, tone: MeterTone) =>
  tone === METER_TONE.COMPLETE ? theme.colors.successText : theme.colors.warningText;

export const Root = styled.span<{ $size: MeterSize }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: ${({ theme, $size }) => theme.layout.meterSegment[$size].gap}px;
`;

export const Segment = styled.span<{ $size: MeterSize; $tone: MeterTone; $filled: boolean }>`
  width: ${({ theme, $size }) => theme.layout.meterSegment[$size].width}px;
  height: ${({ theme, $size }) => theme.layout.meterSegment[$size].height}px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background: ${({ theme, $tone, $filled }) => ($filled ? fillColor(theme, $tone) : theme.colors.border)};
`;
