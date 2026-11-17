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

export const ListPopoverBody = styled.div<{ $width: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  width: ${({ $width }) => $width}px;
  max-width: 100%;
`;

export const ListPopoverHead = styled.div`
  ${textStyle('bodyMedium')}
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;
  color: ${({ theme }) => theme.colors.text};
`;

export const CountTag = styled.span`
  ${textStyle('captionStrong')}
  padding: 0 ${({ theme }) => theme.space.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgElevated};
  border-radius: ${({ theme }) => theme.radius.sm}px;
`;

export const ListPopoverCount = styled(CountTag)`
  border-radius: ${({ theme }) => theme.radius.pill}px;
`;

export const ListPopoverList = styled.ul`
  display: flex;
  flex-direction: column;
  max-height: ${({ theme }) => theme.layout.popoverListMaxHeight}px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
`;

export const ListPopoverRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;
  padding: ${({ theme }) => theme.space.xs}px 0;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
`;
