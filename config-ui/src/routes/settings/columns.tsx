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

import type { ActionsColumnOptions, RoleColumnOptions, RoleOption, StatusColumnOptions } from './columns.types';
import { ACCESS_STATUS_TONE, ROLE_OPTIONS } from './constants';

export const buildRoleColumn = <T extends object, R extends string = AccessRole>({
  key,
  title,
  options = ROLE_OPTIONS as unknown as RoleOption<R>[],
  getRole,
  getLabel,
  getLockedReason,
  onChange,
}: RoleColumnOptions<T, R>): TableColumnType<T> => ({
  key,
  title,
  render: (_, record) => {
    const role = getRole(record);
    if (!options.some((option) => option.value === role)) return role;
    const lockedReason = getLockedReason?.(record);
    return (
      <Tooltip title={lockedReason}>
        <Select<R>
          size="small"
          aria-label={getLabel(record)}
          value={role as R}
          options={options}
          disabled={lockedReason !== undefined}
          onChange={(next) => onChange(record, next)}
        />
      </Tooltip>
    );
  },
});

export const buildStatusColumn = <T extends object>({
  key,
  title,
  getStatus,
  labels,
  filter,
}: StatusColumnOptions<T>): TableColumnType<T> => ({
  key,
  title,
  ...(filter && {
    filters: filter.options,
    filterMultiple: false,
    filteredValue: filter.value ? [filter.value] : null,
  }),
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
  canToggle = () => true,
  canRemove = () => true,
  renderExtra,
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
        {canToggle(record) && (
          <Button
            danger={active}
            aria-label={active ? labels.disableFor(name) : labels.enableFor(name)}
            onClick={() => onToggle(record, nextStatus)}
          >
            {active ? labels.disable : labels.enable}
          </Button>
        )}
        {renderExtra?.(record)}
        {canRemove(record) && (
          <Tooltip title={labels.removeFor(name)}>
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={labels.removeFor(name)}
              onClick={() => onRemove(record)}
            />
          </Tooltip>
        )}
      </Space>
    );
  },
});
