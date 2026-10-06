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

export const Root = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;
  padding: ${({ theme }) => theme.space.sm}px;
  background: ${({ theme }) => theme.colors.primarySubtle};
  border: 1px solid ${({ theme }) => theme.sidebar.divider};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const Progress = styled.span`
  ${textStyle('captionStrong')}
  color: ${({ theme }) => theme.colors.onSelected};
`;

export const Indicator = styled.span<{ $tone: StatusTone }>`
  display: inline-flex;
  color: ${(p) => toneColors(p.theme)[p.$tone].dot};
`;

export const Copy = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
`;

export const Title = styled.p`
  ${textStyle('bodyMedium')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const Message = styled.p`
  ${textStyle('body')}
  margin: 0;
  min-width: 0;
  color: ${({ theme }) => theme.colors.text};
`;
