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

import { Tag } from 'antd';
import styled, { type DefaultTheme } from 'styled-components';

import { WEIGHT } from '@/theme/scales';
import { STATUS_TONE } from '@/ui/constants';
import { textStyle } from '@/ui/style-helpers';
import type { StatusTone } from '@/ui/types';

import { STATUS_BADGE_VARIANT } from './constants';
import type { StatusBadgeVariant } from './types';

type ToneColors = { text: string; bg: string; dot: string };

const toneColors = ({ colors }: DefaultTheme): Record<StatusTone, ToneColors> => ({
  [STATUS_TONE.SUCCESS]: { text: colors.successText, bg: colors.successBg, dot: colors.success },
  [STATUS_TONE.WARNING]: { text: colors.warningText, bg: colors.warningBg, dot: colors.warning },
  [STATUS_TONE.ERROR]: { text: colors.errorActive, bg: colors.errorBg, dot: colors.error },
  [STATUS_TONE.INFO]: { text: colors.infoText, bg: colors.infoTintBg, dot: colors.infoText },
  [STATUS_TONE.NEUTRAL]: { text: colors.textSecondary, bg: colors.bgTableHeader, dot: colors.textSecondary },
});

type BadgeProps = { $tone: StatusTone; $variant: StatusBadgeVariant };

export const Badge = styled(Tag)<BadgeProps>`
  ${textStyle('caption')}
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xxs}px;
  margin: 0;
  max-width: 100%;
  font-weight: ${WEIGHT.medium};
  color: ${(p) => toneColors(p.theme)[p.$tone].text};
  background: ${(p) => (p.$variant === STATUS_BADGE_VARIANT.DOT ? toneColors(p.theme)[p.$tone].bg : 'transparent')};
  border-color: transparent;
  ${(p) => p.$variant === STATUS_BADGE_VARIANT.TEXT && `padding-inline: 0;`}
`;

export const Dot = styled.span<{ $tone: StatusTone }>`
  flex: none;
  width: ${({ theme }) => theme.layout.statusDotSize}px;
  height: ${({ theme }) => theme.layout.statusDotSize}px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background: ${(p) => toneColors(p.theme)[p.$tone].dot};
`;

export const Label = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
