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

export const NameList = styled.ul`
  ${textStyle('body')}
  margin: ${({ theme }) => theme.space.xs}px 0 0;
  padding-left: ${({ theme }) => theme.space.lg}px;
  list-style: disc;
  color: ${({ theme }) => theme.colors.text};
`;

export const Lead = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs}px;
  margin-top: ${({ theme }) => theme.space.md}px;
`;

export const SectionTitle = styled.h4`
  ${textStyle('bodyMedium')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const FailureList = styled(NameList)`
  color: ${({ theme }) => theme.colors.error};
`;
