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

import { textStyle } from '@/ui/style-helpers';

export const ExpirationCell = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const PathText = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Fields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const PathRow = styled.div`
  display: flex;
  align-items: stretch;
  min-width: 0;
`;

export const PathPrefix = styled.span`
  ${textStyle('body')}
  display: inline-flex;
  align-items: center;
  flex: none;
  max-width: 60%;
  padding: 0 ${({ theme }) => theme.space.sm}px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.bgTableHeader};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-right: 0;
  border-radius: ${({ theme }) => theme.radius.sm}px 0 0 ${({ theme }) => theme.radius.sm}px;
`;

export const Dialog = styled(Modal)`
  .ant-modal-title {
    ${textStyle('h3')}
  }

  .ant-modal-header {
    margin-bottom: ${({ theme }) => theme.space.lg}px;
  }
`;

export const DialogTitle = styled.span`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const GeneratedBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const Hint = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;
