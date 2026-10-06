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

export const Root = styled.div<{ $collapsed: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  justify-content: center;
  gap: ${({ theme }) => theme.space.xxs}px;
  height: ${({ theme }) => theme.layout.sidebarHeaderHeight}px;
  min-width: 0;
  padding-inline: ${({ theme, $collapsed }) => ($collapsed ? 0 : theme.space.md)}px;
`;

export const Wordmark = styled.img`
  display: block;
  width: ${({ theme }) => theme.layout.wordmarkWidth}px;
  max-width: 100%;
  height: auto;
  filter: ${({ theme }) => theme.sidebar.logoFilter};
`;

export const PoweredBy = styled.span`
  ${textStyle('caption')}
  color: ${({ theme }) => theme.sidebar.textMuted};
  white-space: nowrap;
`;

export const MarkTile = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ theme }) => theme.layout.markTileSize}px;
  height: ${({ theme }) => theme.layout.markTileSize}px;
  background: ${({ theme }) => theme.sidebar.markBg};
  border-radius: ${({ theme }) => theme.radius.md}px;
`;

export const CustomTitle = styled.h2`
  ${textStyle('h3')}
  margin: 0;
  overflow: hidden;
  color: ${({ theme }) => theme.sidebar.text};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const CustomInitial = styled.span`
  ${textStyle('bodyMedium')}
  color: ${({ theme }) => theme.sidebar.text};
`;
