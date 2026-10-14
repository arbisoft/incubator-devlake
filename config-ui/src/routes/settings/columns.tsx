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

import { DeleteOutlined } from '@ant-design/icons';
import { Button, Select, Space, Tooltip, type TableColumnType } from 'antd';

import { ACCESS_STATUS, type AccessRole, type AccessStatus } from '@/api/access';
import { StatusBadge } from '@/ui';

import type { ActionsColumnOptions, RoleColumnOptions, StatusColumnOptions } from './columns.types';
import { ACCESS_STATUS_TONE, ROLE_OPTIONS } from './constants';

export const buildRoleColumn = <T extends object>({
  key,
  title,
  getRole,
  getLabel,
  onChange,
}: RoleColumnOptions<T>): TableColumnType<T> => ({
  key,
  title,
  render: (_, record) => (
    <Select<AccessRole>
      size="small"
      aria-label={getLabel(record)}
      value={getRole(record)}
      options={ROLE_OPTIONS}
      onChange={(role) => onChange(record, role)}
    />
  ),
});

export const buildStatusColumn = <T extends object>({
  key,
  title,
  getStatus,
  labels,
}: StatusColumnOptions<T>): TableColumnType<T> => ({
  key,
  title,
  render: (_, record) => {
    const status = getStatus(record);
    return <StatusBadge tone={ACCESS_STATUS_TONE[status]} label={labels[status]} variant="dot" />;
  },
});

export const buildActionsColumn = <T extends object>({
  key,
  title,
  getStatus,
  getName,
  labels,
  onToggle,
  onRemove,
}: ActionsColumnOptions<T>): TableColumnType<T> => ({
  key,
  title,
  align: 'right',
  render: (_, record) => {
    const name = getName(record);
    const active = getStatus(record) === ACCESS_STATUS.ACTIVE;
    const nextStatus: AccessStatus = active ? ACCESS_STATUS.DISABLED : ACCESS_STATUS.ACTIVE;
    return (
      <Space size="small">
        <Button
          danger={active}
          aria-label={active ? labels.disableFor(name) : labels.enableFor(name)}
          onClick={() => onToggle(record, nextStatus)}
        >
          {active ? labels.disable : labels.enable}
        </Button>
        <Tooltip title={labels.removeFor(name)}>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={labels.removeFor(name)}
            onClick={() => onRemove(record)}
          />
        </Tooltip>
      </Space>
    );
  },
});
