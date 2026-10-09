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

import { textStyle, toneColors } from '@/ui/style-helpers';
import type { StatusTone } from '@/ui/types';

export const Log = styled.div`
  ${textStyle('caption')}
  padding: ${({ theme }) => theme.space.sm}px ${({ theme }) => theme.space.lg}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgTableHeader};
  border-radius: ${({ theme }) => theme.radius.md}px;
`;

export const LogTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const LogName = styled.span`
  ${textStyle('captionStrong')}
  flex: 0 1 ${({ theme }) => theme.layout.wizardLogNameWidth}px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

export const LogProgress = styled.span`
  flex: auto;
`;

export const LogTasks = styled.ul`
  margin: ${({ theme }) => theme.space.sm}px 0 0;
  padding: 0;
  list-style: none;
`;

export const LogTask = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;

  & + & {
    margin-top: ${({ theme }) => theme.space.xs}px;
  }
`;

export const LogTaskName = styled.span`
  flex: auto;
`;

export const LogTaskStatus = styled.span`
  flex: 0 0 ${({ theme }) => theme.layout.wizardLogStatusWidth}px;
`;

export const LogTaskIcon = styled.span<{ $tone: StatusTone }>`
  display: inline-flex;
  color: ${({ theme, $tone }) => toneColors(theme)[$tone].text};
`;
