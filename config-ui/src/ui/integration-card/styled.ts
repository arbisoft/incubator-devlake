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

export const Root = styled.article<{ $connected: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  padding: ${({ theme }) => theme.space.sm}px;
  background: ${({ theme, $connected }) =>
    $connected
      ? `linear-gradient(to bottom, ${theme.colors.primarySubtle}, ${theme.colors.primarySubtleEnd})`
      : theme.colors.bgContainer};
  border: 1px solid ${({ theme, $connected }) => ($connected ? theme.colors.primarySubtleBorder : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xxs}px;
`;

export const Name = styled.h3`
  ${textStyle('h3')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`;

export const CategoryRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const Category = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Counts = styled.div`
  ${textStyle('caption')}
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Details = styled.div`
  ${textStyle('caption')}
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xxs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xxs}px;
  margin-top: auto;
`;
