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

import { Modal } from 'antd';
import styled from 'styled-components';

import { scrollableModal, textStyle } from '@/ui/style-helpers';

import { CONFIRM_TONE } from './constants';
import type { ConfirmModalProps } from './types';

export const Dialog = styled(Modal)`
  ${scrollableModal}

  .ant-modal-title {
    ${textStyle('h3')}
  }
`;

export const TitleRow = styled.span`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const Icon = styled.span<{ $tone: ConfirmModalProps['tone'] }>`
  display: inline-flex;
  color: ${({ theme, $tone }) => ($tone === CONFIRM_TONE.DANGER ? theme.colors.error : theme.colors.warningText)};
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const Description = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space.sm}px;
`;
