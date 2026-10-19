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

export const Cell = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  min-width: 0;
`;

export const Bar = styled.div`
  flex: 1;
  min-width: 0;
`;

export const Percent = styled.span`
  ${textStyle('caption')}
  flex: none;
  min-width: ${({ theme }) => theme.space.xl}px;
  text-align: right;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
