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

import { Button, Popconfirm, Select, Space, Tag, Tooltip } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import {
  ACCESS_STATUS,
  type AccessAuditEvent,
  type AccessDomain,
  type AccessRole,
  type AccessStatus,
  type AccessUser,
} from '@/api/access';

import { ACCESS_STATUS_COLOR, ROLE_OPTIONS } from './constants';

export type UserColumnActions = {
  onRoleChange: (user: AccessUser, nextRole: AccessRole) => void;
  onStatusChange: (user: AccessUser, nextStatus: AccessStatus) => void;
  onRemove: (user: AccessUser) => void;
};

export type DomainColumnActions = {
  onRoleChange: (domain: AccessDomain, nextRole: AccessRole) => void;
  onStatusChange: (domain: AccessDomain, nextStatus: AccessStatus) => void;
  onRemove: (domain: AccessDomain) => void;
};

export const getUserColumns = (actions: UserColumnActions): ColumnsType<AccessUser> => [
  { title: 'Email', dataIndex: 'email', key: 'email' },
  {
    title: 'Name',
    dataIndex: 'displayName',
    key: 'displayName',
    render: (value: string) => value || 'Pending first login',
  },
  {
    title: 'Role',
    dataIndex: 'role',
    key: 'role',
    render: (value: AccessRole, user: AccessUser) => (
      <Select
        size="small"
        value={value}
        options={ROLE_OPTIONS}
        onChange={(nextRole) => actions.onRoleChange(user, nextRole)}
      />
    ),
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (value: AccessStatus) => <Tag color={ACCESS_STATUS_COLOR[value]}>{value}</Tag>,
  },
  {
    title: '',
    key: 'actions',
    width: 160,
    render: (_: unknown, user: AccessUser) => (
      <Space size="small">
        <Button
          size="small"
          danger={user.status === ACCESS_STATUS.ACTIVE}
          onClick={() =>
            actions.onStatusChange(
              user,
              user.status === ACCESS_STATUS.ACTIVE ? ACCESS_STATUS.DISABLED : ACCESS_STATUS.ACTIVE,
            )
          }
        >
          {user.status === ACCESS_STATUS.ACTIVE ? 'Disable' : 'Enable'}
        </Button>
        <Popconfirm
          title="Remove this person from User Management?"
          description="Their DevLake access will be disabled and the record will remain in audit history."
          okText="Remove"
          okButtonProps={{ danger: true }}
          onConfirm={() => actions.onRemove(user)}
        >
          <Tooltip title="Remove person from User Management">
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove person" />
          </Tooltip>
        </Popconfirm>
      </Space>
    ),
  },
];

export const getDomainColumns = (actions: DomainColumnActions): ColumnsType<AccessDomain> => [
  { title: 'Domain', dataIndex: 'domain', key: 'domain' },
  {
    title: 'Default role',
    dataIndex: 'defaultRole',
    key: 'defaultRole',
    render: (value: AccessRole, accessDomain: AccessDomain) => (
      <Select
        size="small"
        value={value}
        options={ROLE_OPTIONS}
        onChange={(nextRole) => actions.onRoleChange(accessDomain, nextRole)}
      />
    ),
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (value: AccessStatus) => <Tag color={ACCESS_STATUS_COLOR[value]}>{value}</Tag>,
  },
  {
    title: '',
    key: 'actions',
    width: 160,
    render: (_: unknown, accessDomain: AccessDomain) => (
      <Space size="small">
        <Button
          size="small"
          danger={accessDomain.status === ACCESS_STATUS.ACTIVE}
          onClick={() =>
            actions.onStatusChange(
              accessDomain,
              accessDomain.status === ACCESS_STATUS.ACTIVE ? ACCESS_STATUS.DISABLED : ACCESS_STATUS.ACTIVE,
            )
          }
        >
          {accessDomain.status === ACCESS_STATUS.ACTIVE ? 'Disable' : 'Enable'}
        </Button>
        <Popconfirm
          title="Remove this domain from User Management?"
          description="This stops automatic provisioning only. Existing people keep their current access, and the record remains in audit history."
          okText="Remove"
          okButtonProps={{ danger: true }}
          onConfirm={() => actions.onRemove(accessDomain)}
        >
          <Tooltip title="Remove domain from User Management">
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove domain" />
          </Tooltip>
        </Popconfirm>
      </Space>
    ),
  },
];

export const getAuditColumns = (): ColumnsType<AccessAuditEvent> => [
  { title: 'When', dataIndex: 'createdAt', key: 'createdAt' },
  { title: 'Action', dataIndex: 'action', key: 'action' },
  {
    title: 'Actor',
    dataIndex: 'actorEmail',
    key: 'actorEmail',
    render: (value: string) => value || 'System',
  },
  {
    title: 'Target',
    dataIndex: 'targetEmail',
    key: 'targetEmail',
    render: (value: string) => value || '-',
  },
  { title: 'Detail', dataIndex: 'detail', key: 'detail' },
];
