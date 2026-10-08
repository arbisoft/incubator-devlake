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
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
  padding: ${({ theme }) => theme.space.sm}px;
  background: ${({ theme }) => theme.colors.primarySubtle};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const PanelTitle = styled.h2`
  ${textStyle('h3')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const PanelBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  min-width: 0;

  &[hidden] {
    display: none;
  }
`;

export const PanelActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const ActionNote = styled.span`
  ${textStyle('caption')}
  margin-right: ${({ theme }) => theme.space.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const EnabledSwitch = styled.label`
  ${textStyle('body')}
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  margin-right: ${({ theme }) => theme.space.xs}px;
  color: ${({ theme }) => theme.colors.text};
`;

export const EmptyNote = styled.p`
  ${textStyle('body')}
  margin: 0;
  padding: ${({ theme }) => theme.space.md}px;
  background: ${({ theme }) => theme.colors.bgContainer};
  border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
