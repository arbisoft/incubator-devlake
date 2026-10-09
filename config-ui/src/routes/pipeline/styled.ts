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

import { Select } from 'antd';
import styled from 'styled-components';

import { textStyle } from '@/ui/style-helpers';

export const BlueprintSelect = styled(Select)`
  width: ${({ theme }) => theme.layout.searchMaxWidth}px;
`;

export const Info = styled.div`
  ul {
    display: flex;
    align-items: center;
  }

  li {
    flex: 5;
    display: flex;
    flex-direction: column;

    &:last-child {
      flex: 1;
    }

    & > span {
      ${textStyle('caption')}
      color: ${({ theme }) => theme.colors.textTertiary};
      text-align: center;
    }

    & > strong {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: ${({ theme }) => theme.space.xs}px;
    }
  }

  p.message {
    margin: ${({ theme }) => theme.space.xs}px 0 0;
    color: ${({ theme }) => theme.colors.error};
  }
`;

export const Tasks = styled.div`
  position: relative;
  padding-right: ${({ theme }) => theme.space.xl}px;

  .inner {
    overflow: auto;
  }

  .collapse-control {
    position: absolute;
    right: 0;
    top: 0;
  }
`;

export const TasksHeader = styled.ul`
  display: flex;
  align-items: center;

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: 0 0 30%;
    padding: ${({ theme }) => theme.space.xs}px ${({ theme }) => theme.space.sm}px;

    &.ready,
    &.cancel {
      color: ${({ theme }) => theme.colors.textTertiary};
      background-color: ${({ theme }) => theme.colors.bgStatus};
    }

    &.loading {
      color: ${({ theme }) => theme.colors.primary};
      background-color: ${({ theme }) => theme.colors.infoBg};
    }

    &.success {
      color: ${({ theme }) => theme.colors.success};
      background-color: ${({ theme }) => theme.colors.successBg};
    }

    &.error {
      color: ${({ theme }) => theme.colors.errorAlt};
      background-color: ${({ theme }) => theme.colors.errorBg};
    }
  }

  li + li {
    margin-left: ${({ theme }) => theme.space.md}px;
  }
`;

export const TasksList = styled.ul<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  align-items: flex-start;

  li {
    flex: 0 0 30%;
    padding-bottom: ${({ theme }) => theme.space.xs}px;
    overflow: hidden;
  }

  li + li {
    margin-left: ${({ theme }) => theme.space.md}px;
  }
`;

export const Task = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space.md}px 0;
  height: ${({ theme }) => theme.layout.pipelineTaskHeight}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderTask};
  box-sizing: border-box;

  .info {
    flex: auto;
    overflow: hidden;

    .title {
      display: flex;
      align-items: center;
      margin-bottom: ${({ theme }) => theme.space.xs}px;

      & > strong {
        margin: 0 ${({ theme }) => theme.space.xxs}px;
      }

      & > span {
        flex: auto;
        overflow: hidden;
      }
    }

    p {
      padding-left: ${({ theme }) => theme.space.lg}px;
      margin: 0;
      ${textStyle('caption')}
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;

      &.error {
        color: ${({ theme }) => theme.colors.error};
      }
    }
  }

  .duration {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 ${({ theme }) => theme.layout.pipelineTaskDurationWidth}px;
    text-align: right;
  }
`;

export const SubtaskCount = styled.strong`
  margin-left: ${({ theme }) => theme.space.xs}px;
`;
