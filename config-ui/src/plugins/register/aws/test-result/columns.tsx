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

import type { TableColumnsType } from 'antd';

import { AWS_COLUMN_WIDTH } from '@/theme/aws-columns';
import { STATUS_BADGE_VARIANT, STATUS_TONE, StatusBadge, type StatusTone } from '@/ui';

import { CHECK_STATUS, COPY, REQUIREMENT_LABEL } from '../constants';
import { CellText } from '../styled';
import type { CheckStatus, ResultRow } from '../types';

const STATUS_TONES: Record<CheckStatus, StatusTone> = {
  [CHECK_STATUS.ALLOWED]: STATUS_TONE.SUCCESS,
  [CHECK_STATUS.DENIED]: STATUS_TONE.ERROR,
  [CHECK_STATUS.NOT_CHECKED]: STATUS_TONE.NEUTRAL,
  [CHECK_STATUS.ERROR]: STATUS_TONE.WARNING,
};

const { columns } = COPY.testResult;

export const RESULT_COLUMNS: TableColumnsType<ResultRow> = [
  {
    title: columns.permission,
    dataIndex: 'permission',
    key: 'permission',
    width: AWS_COLUMN_WIDTH.permission,
    render: (permission: string) => <CellText>{permission}</CellText>,
  },
  {
    title: columns.result,
    key: 'status',
    width: AWS_COLUMN_WIDTH.result,
    render: (_, { status }) => (
      <StatusBadge
        tone={STATUS_TONES[status]}
        label={COPY.testResult.status[status]}
        variant={STATUS_BADGE_VARIANT.DOT}
      />
    ),
  },
  { title: columns.region, dataIndex: 'region', key: 'region', width: AWS_COLUMN_WIDTH.region },
  {
    title: columns.required,
    key: 'requirement',
    width: AWS_COLUMN_WIDTH.requirement,
    render: (_, { requirement }) => (requirement ? (REQUIREMENT_LABEL[requirement] ?? requirement) : COPY.emptyCell),
  },
  {
    title: columns.detail,
    dataIndex: 'detail',
    key: 'detail',
    width: AWS_COLUMN_WIDTH.detail,
    render: (detail: string) => <CellText>{detail}</CellText>,
  },
];
