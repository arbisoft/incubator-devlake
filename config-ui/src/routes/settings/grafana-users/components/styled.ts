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

import { STATUS_TONE } from '@/ui/constants';
import { textStyle, toneColors } from '@/ui/style-helpers';

export const Notice = styled.div`
  ${textStyle('body')}
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  margin-bottom: ${({ theme }) => theme.space.md}px;
  padding: ${({ theme }) => theme.space.sm}px ${({ theme }) => theme.space.md}px;
  color: ${({ theme }) => toneColors(theme)[STATUS_TONE.WARNING].text};
  background: ${({ theme }) => toneColors(theme)[STATUS_TONE.WARNING].bg};
  border-radius: ${({ theme }) => theme.radius.md}px;
`;

export const NoticeIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => toneColors(theme)[STATUS_TONE.WARNING].dot};
`;

export const OrphanList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const OrphanRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.md}px;
  padding: ${({ theme }) => theme.space.sm}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
`;

export const OrphanAccount = styled.span`
  ${textStyle('body')}
  flex: 0 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
`;

export const OrphanProjects = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xxs}px;
  min-width: 0;
`;

export const NoticeText = styled.span`
  flex: 1 1 auto;
`;
