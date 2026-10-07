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

import { Steps } from 'antd';
import styled from 'styled-components';

import { textStyle } from '@/ui/style-helpers';

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const Fields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const Notice = styled.div`
  margin-top: ${({ theme }) => theme.space.sm}px;
`;

export const Footer = styled.div`
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  gap: ${({ theme }) => theme.space.sm}px;
  padding-top: ${({ theme }) => theme.space.md}px;
  background: ${({ theme }) => theme.colors.bgContainer};
`;

export const Transformations = styled.div`
  .ant-collapse {
    background: transparent;
  }

  .ant-collapse-item {
    margin-bottom: ${({ theme }) => theme.space.sm}px !important;
    overflow: hidden;
  }

  .ant-collapse-header {
    flex-direction: row-reverse;
    justify-content: space-between;
    ${textStyle('h3')}
  }

  && .ant-collapse-body {
    ${textStyle('body')}
  }

  .ant-collapse-body p {
    ${textStyle('body')}
    color: ${({ theme }) => theme.colors.textSecondary};
  }

  && .ant-tag-filled.ant-tag-blue {
    border-color: ${({ theme }) => theme.colors.primarySubtleBorder};
    background: ${({ theme }) => theme.colors.primarySubtle};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

export const Progress = styled(Steps)`
  .ant-steps-item-finish .ant-steps-item-icon {
    border-color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primary};
  }

  .ant-steps-item-finish .ant-steps-item-icon-finish {
    color: ${({ theme }) => theme.brand.onPrimary};
  }

  .ant-steps-item-finish .ant-steps-item-rail {
    background: ${({ theme }) => theme.colors.primary};
  }
`;
