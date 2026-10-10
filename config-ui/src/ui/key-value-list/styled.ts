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

export const List = styled.dl`
  ${textStyle('caption')}
  margin: 0;
`;

export const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space.md}px;
  padding: ${({ theme }) => theme.space.xs}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};

  &:last-child {
    border-bottom: 0;
  }
`;

export const Term = styled.dt`
  flex: none;
  width: ${({ theme }) => theme.layout.keyValueLabelWidth}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Detail = styled.dd`
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: ${({ theme }) => theme.colors.text};
`;
