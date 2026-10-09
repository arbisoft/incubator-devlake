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

import { focusRingStyle, textStyle } from '@/ui/style-helpers';

import { Tag } from '../readiness';

export const IconLabel = styled.span`
  display: inline-flex;
`;

export const IconRow = styled.span`
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.xxs}px;
`;

export const MoreCount = styled(Tag)`
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.primarySubtle};
  border-radius: ${({ theme }) => theme.radius.pill}px;
  white-space: nowrap;
`;

export const TriggerButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  max-width: 100%;
  padding: 0;
  color: inherit;
  text-align: left;
  background: none;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm}px;
  cursor: default;

  &:focus-visible {
    ${focusRingStyle}
  }
`;

export const PercentLabel = styled.span`
  ${textStyle('caption')}
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const PopoverBody = styled.div<{ $width: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  width: ${({ $width }) => $width}px;
  max-width: 100%;
`;

export const PopoverHead = styled.div`
  ${textStyle('bodyMedium')}
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;
  color: ${({ theme }) => theme.colors.text};
`;

export const PopoverCount = styled(Tag)`
  border-radius: ${({ theme }) => theme.radius.pill}px;
`;

export const PopoverSubtitle = styled.p`
  ${textStyle('caption')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const PopoverList = styled.ul`
  display: flex;
  flex-direction: column;
  max-height: ${({ theme }) => theme.layout.popoverListMaxHeight}px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
`;

export const PopoverRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;
  padding: ${({ theme }) => theme.space.xs}px 0;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
`;

export const RowCopy = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

export const RowTitle = styled.span`
  ${textStyle('bodyMedium')}
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const RowSubtitle = styled.span`
  ${textStyle('caption')}
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const SourceText = styled.span`
  ${textStyle('captionStrong')}
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: right;
`;

export const Chips = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs}px;
  margin: 0;
  padding: ${({ theme }) => theme.space.sm}px 0 0;
  list-style: none;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

export const Chip = styled(Tag).attrs({ as: 'li' })`
  ${textStyle('caption')}
  display: inline-flex;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const ChipCount = styled.span`
  ${textStyle('captionStrong')}
  color: ${({ theme }) => theme.colors.text};
`;

export const PopoverFooter = styled.div`
  ${textStyle('caption')}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.sm}px;
  color: ${({ theme }) => theme.colors.textSecondary};

  a {
    ${textStyle('captionStrong')}
    color: ${({ theme }) => theme.colors.link};
    white-space: nowrap;
  }
`;
