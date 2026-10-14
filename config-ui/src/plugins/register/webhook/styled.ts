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
  display: grid;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const Intro = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const Success = styled.h2`
  ${textStyle('h3')}
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space.xs}px;
  margin: 0;
  color: ${({ theme }) => theme.colors.success};
`;

export const Group = styled.section`
  display: grid;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const GroupTitle = styled.h3`
  ${textStyle('h3')}
  margin: 0;
`;

export const Command = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space.xxs}px;
`;

export const CommandLabel = styled.span`
  ${textStyle('bodyMedium')}
`;

export const Hint = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const KeyRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const Notice = styled.strong`
  ${textStyle('bodyMedium')}
`;

export const LoadingRow = styled.div`
  padding: ${({ theme }) => theme.space.xxs}px ${({ theme }) => theme.space.sm}px;
`;
