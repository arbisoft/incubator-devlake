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

import { Segmented, Tabs } from 'antd';
import styled from 'styled-components';

export const FlatTabs = styled(Tabs)`
  && .ant-tabs-nav {
    margin: 0;
    padding: ${({ theme }) => theme.layout.segmentInset}px;
    background: ${({ theme }) => theme.colors.primarySubtle};
    border-radius: ${({ theme }) => theme.radius.md}px;

    &::before {
      display: none;
    }
  }

  && .ant-tabs-nav-list {
    gap: ${({ theme }) => theme.layout.segmentInset}px;
  }

  && .ant-tabs-tab {
    margin: 0;
    padding: ${({ theme }) => theme.layout.segmentPaddingBlock}px ${({ theme }) => theme.layout.segmentPaddingInline}px;
    border-radius: ${({ theme }) => theme.radius.sm}px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }

  && .ant-tabs-tab-active {
    background: ${({ theme }) => theme.colors.bgContainer};
    box-shadow: ${({ theme }) => theme.shadow.segmentSelected};

    .ant-tabs-tab-btn {
      color: ${({ theme }) => theme.colors.text};
    }
  }

  .ant-tabs-ink-bar {
    display: none;
  }
`;

export const PillScroller = styled.div`
  max-width: 100%;
  overflow-x: auto;
`;

export const PillTabs = styled(Segmented)`
  width: max-content;

  .ant-segmented-item-selected {
    color: ${({ theme }) => theme.colors.onSelected};
    outline: 1px solid ${({ theme }) => theme.colors.primaryActive};
    outline-offset: -1px;
  }
`;
