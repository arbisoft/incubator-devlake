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

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const NameValue = styled.p`
  ${textStyle('body')}
  margin: 0;
  overflow-wrap: anywhere;
  color: ${({ theme }) => theme.colors.text};
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, ${({ theme }) => theme.layout.connectionCardMinWidth}px), 1fr)
  );
  gap: ${({ theme }) => theme.space.md}px;
`;

export const Card = styled.article`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  min-width: 0;
  padding: ${({ theme }) => theme.space.sm}px;
  background: ${({ theme }) => theme.colors.bgContainer};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const CardName = styled.h3`
  ${textStyle('h3')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`;

export const CardCount = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.space.md}px;
`;

export const OptionRow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
`;
