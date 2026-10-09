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

export const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xxs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const MoreButton = styled.button`
  ${textStyle('caption')}
  padding: 0;
  color: ${({ theme }) => theme.colors.primary};
  text-align: left;
  background: none;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm}px;
  cursor: pointer;

  &:focus-visible {
    ${focusRingStyle}
  }
`;

export const HiddenList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xxs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`;
