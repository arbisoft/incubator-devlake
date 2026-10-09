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

import { WEIGHT } from '@/theme/scales';
import { focusRingStyle, motionTransition, textStyle } from '@/ui/style-helpers';

const trigger = styled.button`
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.sidebar.text};
  background: transparent;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md}px;
  cursor: pointer;
  ${motionTransition('background-color')}

  &:hover {
    background: ${({ theme }) => theme.sidebar.itemHoverBg};
  }

  &:focus-visible {
    ${focusRingStyle}
  }
`;

export const Expanded = styled(trigger)`
  gap: ${({ theme }) => theme.space.xs}px;
  width: 100%;
  padding: ${({ theme }) => theme.space.sm}px;
  text-align: left;
`;

export const Rail = styled(trigger)`
  justify-content: center;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.xxs}px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
`;

export const Copy = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

export const Name = styled.span`
  ${textStyle('bodyMedium')}
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Secondary = styled.span`
  ${textStyle('caption')}
  color: ${({ theme }) => theme.sidebar.textMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Avatar = styled.span`
  ${textStyle('captionStrong')}
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ theme }) => theme.layout.avatarSize}px;
  height: ${({ theme }) => theme.layout.avatarSize}px;
  font-weight: ${WEIGHT.semibold};
  background: ${({ theme }) => theme.sidebar.itemHoverBg};
  border-radius: ${({ theme }) => theme.radius.pill}px;
`;
