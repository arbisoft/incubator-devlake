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

export const Fields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const Note = styled.p`
  ${textStyle('body')}
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space.xxs}px;
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const NoteIcon = styled.span`
  display: inline-flex;
  align-items: center;
  height: ${({ theme }) => theme.typography.scale.body.lineHeight}px;
  color: ${({ theme }) => theme.colors.warning};
`;

export const FieldError = styled.p`
  ${textStyle('caption')}
  margin: ${({ theme }) => theme.space.xxs}px 0 0;
  color: ${({ theme }) => theme.colors.errorActive};
`;

export const Root = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space.sm}px;
`;
