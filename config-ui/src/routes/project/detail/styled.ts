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

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const NoticeText = styled.p`
  ${textStyle('body')}
  margin: 0;
`;

export const NoticeBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  padding: ${({ theme }) => theme.space.md}px;
  background: ${({ theme }) => theme.colors.primarySubtle};
  border: 1px solid ${({ theme }) => theme.colors.primarySubtleBorder};
  border-radius: ${({ theme }) => theme.radius.lg}px;

  a {
    color: ${({ theme }) => theme.colors.link};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      ${focusRingStyle}
    }
  }
`;

export const Fields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const FieldBox = styled.div`
  max-width: ${({ theme }) => theme.layout.fieldMaxWidth}px;
`;

export const Option = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs}px;

  & + & {
    margin-top: ${({ theme }) => theme.space.md}px;
    padding-top: ${({ theme }) => theme.space.md}px;
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
`;

export const OptionLabel = styled.span`
  ${textStyle('bodyMedium')}
  color: ${({ theme }) => theme.colors.text};
`;

export const OptionHint = styled.p`
  ${textStyle('body')}
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xxs}px;
  margin: 0 0 0 ${({ theme }) => theme.space.lg}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const OptionExtra = styled.div`
  margin-left: ${({ theme }) => theme.space.lg}px;
  max-width: ${({ theme }) => theme.layout.fieldMaxWidth}px;
`;

export const HelpButton = styled.button`
  display: inline-flex;
  padding: 0;
  border: 0;
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;

  &:focus-visible {
    ${focusRingStyle}
  }
`;

export const Examples = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs}px;
  max-width: ${({ theme }) => theme.layout.fieldMaxWidth}px;
  overflow-wrap: anywhere;
`;

export const Footer = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const Warnings = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const Note = styled.p`
  ${textStyle('body')}
  margin: ${({ theme }) => theme.space.md}px 0 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
