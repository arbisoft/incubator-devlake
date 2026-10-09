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

import { Button } from 'antd';
import styled from 'styled-components';

import { WEIGHT } from '@/theme/scales';
import { textStyle } from '@/ui/style-helpers';

export const AsideContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xxl}px;
  padding: ${({ theme }) => theme.space.xxl + theme.space.xs}px ${({ theme }) => theme.space.xl * 2}px
    ${({ theme }) => theme.space.xxl * 2}px;
`;

export const Wordmark = styled.img`
  display: block;
  width: ${({ theme }) => theme.layout.authWordmarkWidth}px;
  height: auto;
`;

export const BrandTitle = styled.p`
  ${textStyle('h2')}
  margin: 0;
`;

export const Pitch = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  padding-bottom: ${({ theme }) => theme.space.xxl * 2}px;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const Headline = styled.h2`
  ${textStyle('hero')}
  margin: 0;
  color: ${({ theme }) => theme.sidebar.text};
`;

export const Support = styled.p`
  ${textStyle('h3')}
  margin: 0;
  font-weight: ${WEIGHT.regular};
  color: ${({ theme }) => theme.sidebar.textMuted};
`;

export const Tiles = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xxl}px;
`;

export const Card = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
  width: 100%;
  max-width: ${({ theme }) => theme.layout.authFormWidth}px;
`;

export const Heading = styled.header`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xxs}px;
`;

export const Title = styled.h1`
  ${textStyle('display')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const Subtitle = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Hint = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Note = styled.p`
  ${textStyle('caption')}
  margin: 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Notices = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;

  &:empty {
    display: none;
  }
`;

export const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const ActionButton = styled(Button)`
  height: ${({ theme }) => theme.layout.authActionHeight}px;
  font-weight: ${WEIGHT.semibold};
`;

export const LogoImage = styled.img<{ $adaptive: boolean }>`
  display: block;
  width: ${({ theme }) => theme.layout.authProviderLogoSize}px;
  height: ${({ theme }) => theme.layout.authProviderLogoSize}px;
  filter: ${({ theme, $adaptive }) => ($adaptive && theme.mode === 'dark' ? theme.sidebar.logoFilter : 'none')};
`;
