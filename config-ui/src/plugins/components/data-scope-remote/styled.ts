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

import { CheckCircleFilled } from '@ant-design/icons';
import { Alert, Button, Tag } from 'antd';
import styled from 'styled-components';

import { focusRingStyle, textStyle } from '@/ui/style-helpers';

import { COLUMN_ID_PREFIX } from './constants';

const COLUMN = `.main > [id^='${COLUMN_ID_PREFIX}']`;
const ROW = '.infinite-scroll-component > div';

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
`;

export const DuplicateAlert = styled(Alert)`
  margin-bottom: ${({ theme }) => theme.space.xxs}px;
`;

export const Frame = styled.div`
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background: ${({ theme }) => theme.colors.bgContainer};

  && ${COLUMN} {
    border: 0;
    background: ${({ theme }) => theme.colors.bgContainer};
  }

  && ${COLUMN} + ${COLUMN} {
    border-left: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }

  && ${COLUMN}:first-child:not(:last-child) {
    background: ${({ theme }) => theme.colors.bgTableHeader};
  }

  && ${ROW} {
    min-height: ${({ theme }) => theme.layout.scopeRowHeight}px;
    padding: 0 ${({ theme }) => theme.space.sm}px 0 ${({ theme }) => theme.space.sm}px;
    color: ${({ theme }) => theme.colors.text};

    &:hover {
      background: ${({ theme }) => theme.colors.primarySubtle};
    }

    &[selected] {
      background: ${({ theme }) => theme.colors.primarySubtleEnd};
      color: ${({ theme }) => theme.colors.link};
    }

    &:focus-visible {
      ${focusRingStyle}
      outline-offset: -${({ theme }) => theme.layout.focusRingWidth}px;
    }

    .text {
      margin-left: ${({ theme }) => theme.space.xs}px;
      font-size: ${({ theme }) => theme.typography.scale.body.fontSize}px;
    }

    .indicator {
      border-color: ${({ theme }) => theme.colors.textSecondary};
    }
  }

  && ${ROW} .checkbox {
    box-sizing: border-box;
    width: ${({ theme }) => theme.layout.scopeCheckboxSize}px;
    height: ${({ theme }) => theme.layout.scopeCheckboxSize}px;
    border-color: ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radius.sm}px;
    background-color: ${({ theme }) => theme.colors.bgContainer};

    &.checkbox-checked {
      border-color: ${({ theme }) => theme.colors.primary};
      background-color: ${({ theme }) => theme.colors.primary};

      &::after {
        left: 30%;
        width: 4px;
        height: 8px;
        border-color: ${({ theme }) => theme.brand.onPrimary};
      }
    }

    &.checkbox-indeterminate {
      border-color: ${({ theme }) => theme.colors.border};
      background-color: ${({ theme }) => theme.colors.bgContainer};

      &::after {
        width: 8px;
        height: 2px;
        background-color: ${({ theme }) => theme.colors.primary};
      }
    }

    &.checkbox-disabled {
      border-color: ${({ theme }) => theme.colors.border};
      background-color: ${({ theme }) => theme.colors.bgTableHeader};
    }
  }

  && ${ROW} .radio {
    border-color: ${({ theme }) => theme.colors.border};

    &.radio-checked {
      border-color: ${({ theme }) => theme.colors.primary};

      &::after {
        background-color: ${({ theme }) => theme.colors.primary};
      }
    }
  }
`;

export const ColumnTitle = styled.div`
  ${textStyle('captionStrong')}
  padding: ${({ theme }) => theme.space.xs}px ${({ theme }) => theme.space.sm}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
`;

export const LoadingRow = styled.div`
  padding: ${({ theme }) => theme.space.xxs}px ${({ theme }) => theme.space.sm}px;
`;

export const ErrorRow = styled.span`
  display: block;
  padding: ${({ theme }) => theme.space.xxs}px ${({ theme }) => theme.space.sm}px;
  color: ${({ theme }) => theme.colors.error};
`;

export const SelectedStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  min-height: ${({ theme }) => theme.layout.scopeRowHeight}px;
  padding: ${({ theme }) => theme.space.xs}px ${({ theme }) => theme.space.sm}px;
  border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background: ${({ theme }) => theme.colors.bgTableHeader};
`;

export const SelectedCount = styled.span`
  ${textStyle('bodyMedium')}
  color: ${({ theme }) => theme.colors.text};
`;

export const Placeholder = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const ScopeTag = styled(Tag)`
  max-width: 100%;
  margin-inline-end: 0;
  border: 0;
  background: ${({ theme }) => theme.colors.primarySubtleEnd};
  color: ${({ theme }) => theme.colors.link};
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const ClearButton = styled(Button)`
  margin-left: auto;
`;

export const JobLoad = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;

  & > span.count {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

export const SuccessIcon = styled(CheckCircleFilled)`
  color: ${({ theme }) => theme.colors.success};
`;
