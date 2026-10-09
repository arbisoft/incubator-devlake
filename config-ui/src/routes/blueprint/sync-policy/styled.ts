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

import { DatePicker } from 'antd';
import styled from 'styled-components';

import { textStyle } from '@/ui/style-helpers';

export const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const Note = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const Columns = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, ${({ theme }) => theme.layout.catalogCardMinWidth}px), 1fr));
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const CronFields = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space.xs}px;

  & > * {
    flex: 1 1 0;
    min-width: 0;
  }
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const ErrorText = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.errorActive};
`;

export const RunList = styled.ul`
  ${textStyle('body')}
  margin: 0;
  padding-left: ${({ theme }) => theme.space.md}px;
  color: ${({ theme }) => theme.colors.text};
`;

export const Hint = styled.p`
  ${textStyle('caption')}
  margin: 0;
  padding-left: ${({ theme }) => theme.space.xl}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const StartDate = styled(DatePicker)`
  width: ${({ theme }) => theme.layout.datePickerWidth}px;
`;
