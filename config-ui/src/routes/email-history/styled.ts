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

import { Select } from 'antd';
import styled from 'styled-components';

import { textStyle } from '@/ui/style-helpers';

// Filter selects match the search box width so the toolbar wraps evenly.
export const FilterSelect = styled(Select)`
  min-width: 140px;
`;

export const ProjectSelect = styled(Select)`
  min-width: 200px;
`;

export const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Recipients = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const SectionLabel = styled.h4`
  ${textStyle('body')}
  margin: 0 0 ${({ theme }) => theme.space.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
`;

// The preview frame is sandboxed with no permissions; it only displays the stored HTML, which paints its own background.
export const PreviewFrame = styled.iframe`
  width: 100%;
  height: 480px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md}px;
`;

export const PlainText = styled.pre`
  ${textStyle('body')}
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
`;
