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

import type { AwsPermission } from '@/api/plugin/aws';
import { AWS_COLUMN_WIDTH } from '@/theme/aws-columns';
import { DataTable, EMPTY_STATE_SIZE } from '@/ui';

import { COPY, REQUIREMENT_LABEL } from '../constants';
import { TableFrame } from '../styled';

const { permissions } = COPY.setup;

const COLUMNS: TableColumnsType<AwsPermission> = [
  { title: permissions.columns.action, dataIndex: 'action', key: 'action', width: AWS_COLUMN_WIDTH.permission },
  { title: permissions.columns.usedFor, dataIndex: 'usedFor', key: 'usedFor', width: AWS_COLUMN_WIDTH.usedFor },
  {
    title: permissions.columns.requirement,
    key: 'requirement',
    width: AWS_COLUMN_WIDTH.requirement,
    render: (_, { requirement }) => REQUIREMENT_LABEL[requirement] ?? requirement,
  },
];

export const PermissionsTable = ({ rows }: { rows: AwsPermission[] }) => (
  <TableFrame>
    <DataTable<AwsPermission>
      rowKey="action"
      ariaLabel={permissions.ariaLabel}
      loading={false}
      columns={COLUMNS}
      dataSource={rows}
      pagination={false}
      empty={{ title: permissions.empty, size: EMPTY_STATE_SIZE.SECTION }}
    />
  </TableFrame>
);
