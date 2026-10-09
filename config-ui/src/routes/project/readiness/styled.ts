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

import { textStyle } from '@/ui/style-helpers';

import { SIGNAL_STATE } from './constants';
import type { ReadinessSignalState } from './types';

const stateColors = ({ colors }: DefaultTheme): Record<ReadinessSignalState, { icon: string; bg: string }> => ({
  [SIGNAL_STATE.AVAILABLE]: { icon: colors.success, bg: colors.successBg },
  [SIGNAL_STATE.MISSING]: { icon: colors.error, bg: colors.errorBg },
  [SIGNAL_STATE.UNKNOWN]: { icon: colors.textSecondary, bg: colors.bgTableHeader },
});

export const IconBox = styled.span<{ $state: ReadinessSignalState; $large: boolean }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: ${({ theme, $large }) => theme.layout.signalIconSize[$large ? 'md' : 'sm']}px;
  height: ${({ theme, $large }) => theme.layout.signalIconSize[$large ? 'md' : 'sm']}px;
  font-size: ${({ theme, $large }) => ($large ? theme.typography.scale.caption.fontSize : theme.layout.signalIconSize.sm)}px;
  color: ${({ theme, $state }) => stateColors(theme)[$state].icon};
  background: ${({ theme, $state, $large }) => ($large ? stateColors(theme)[$state].bg : 'transparent')};
  border-radius: ${({ theme }) => theme.radius.pill}px;
`;

export const Tag = styled.span`
  ${textStyle('captionStrong')}
  padding: 0 ${({ theme }) => theme.space.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgElevated};
  border-radius: ${({ theme }) => theme.radius.sm}px;
`;
