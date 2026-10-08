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

import ArbisoftMark from '@/images/brand/arbisoft-mark.svg?react';
import DevlakeMark from '@/images/brand/devlake-mark.svg?react';
import { textStyle } from '@/ui/style-helpers';

import { BRAND_TONE } from './constants';
import type { BrandTone } from './types';

type ToneProps = { $tone: BrandTone };

const primaryColor = ({ theme, $tone }: ToneProps & { theme: DefaultTheme }) =>
  $tone === BRAND_TONE.PAGE ? theme.colors.text : theme.sidebar.text;

const mutedColor = ({ theme, $tone }: ToneProps & { theme: DefaultTheme }) =>
  $tone === BRAND_TONE.PAGE ? theme.colors.textSecondary : theme.sidebar.textMuted;

export const Root = styled.div<{ $collapsed: boolean } & ToneProps>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  height: ${({ theme, $tone }) => ($tone === BRAND_TONE.PAGE ? 'auto' : `${theme.layout.sidebarHeaderHeight}px`)};
  min-width: 0;
  padding-inline: ${({ theme, $collapsed, $tone }) => ($collapsed || $tone === BRAND_TONE.PAGE ? 0 : theme.space.md)}px;
`;

export const Lockup = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;
  min-width: 0;
`;

export const BrandMark = styled(ArbisoftMark)<ToneProps>`
  flex: none;
  width: auto;
  height: ${({ theme }) => theme.layout.brandMarkHeight}px;
  color: ${primaryColor};
`;

export const Names = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const BrandName = styled.span<ToneProps>`
  ${textStyle('h3')}
  color: ${primaryColor};
  white-space: nowrap;
`;

export const ProductName = styled.span<ToneProps>`
  ${textStyle('caption')}
  color: ${mutedColor};
  white-space: nowrap;
`;

export const PoweredBy = styled.p`
  ${textStyle('caption')}
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  margin: 0 0 ${({ theme }) => theme.space.xxs}px;
  padding-inline: ${({ theme }) => theme.space.sm}px;
  color: ${({ theme }) => theme.sidebar.textMuted};
  white-space: nowrap;
`;

export const PoweredByMark = styled(DevlakeMark)`
  flex: none;
  width: ${({ theme }) => theme.layout.poweredByMarkSize}px;
  height: ${({ theme }) => theme.layout.poweredByMarkSize}px;
`;

export const CustomTitle = styled.h2<ToneProps>`
  ${textStyle('h3')}
  margin: 0;
  overflow: hidden;
  color: ${primaryColor};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const CustomInitial = styled.span<ToneProps>`
  ${textStyle('bodyMedium')}
  color: ${primaryColor};
`;
