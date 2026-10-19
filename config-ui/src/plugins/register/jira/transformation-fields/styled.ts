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

export const CrossDomain = styled.div`
  .radio {
  }

  .radio-item {
    display: flex;
    margin-top: ${({ theme }) => theme.space.lg}px;
  }

  .application {
    margin-bottom: ${({ theme }) => theme.space.xs}px;

    span {
      padding: ${({ theme }) => theme.space.xxs}px ${({ theme }) => theme.space.xs}px;
      background-color: ${({ theme }) => theme.colors.bgMuted};
    }

    span + span {
      margin-left: ${({ theme }) => theme.space.xs}px;
    }
  }
`;

export const RemoteLinkWrapper = styled.div`
  .input {
    margin-bottom: ${({ theme }) => theme.space.xs}px;
  }

  .inner {
    display: flex;
    align-items: center;
  }

  .error {
    margin-top: 2px;
    color: ${({ theme }) => theme.colors.errorMuted};
  }
`;

export const DialogBody = styled.div`
  ul,
  pre {
    padding: ${({ theme }) => theme.space.xs}px ${({ theme }) => theme.space.md}px;
    max-height: 240px;
    overflow-y: auto;
    background: ${({ theme }) => theme.colors.bgMuted};
  }

  .search {
    display: flex;
    align-items: center;
  }
`;
