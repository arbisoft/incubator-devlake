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
  gap: ${({ theme }) => theme.space.md}px;
`;

export const BlockTitle = styled.h4`
  ${textStyle('h3')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const Help = styled.p`
  ${textStyle('caption')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const ErrorText = styled.p`
  ${textStyle('caption')}
  margin: 0;
  color: ${({ theme }) => theme.colors.error};
`;

export const BulletList = styled.ul`
  margin: 0;
  padding-inline-start: ${({ theme }) => theme.space.md}px;
`;

// Keeps a wide table from widening the form; the table scrolls sideways instead.
export const TableFrame = styled.div`
  contain: inline-size;
  overflow-x: auto;
`;

// Matches the spacing between the shared connection fields.
export const SectionGap = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space.lg}px;
  margin-block: ${({ theme }) => theme.space.lg}px;
`;

// AWS error text carries long ARNs with no spaces, so it may break anywhere.
export const CellText = styled.span`
  overflow-wrap: anywhere;
`;
