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

import { Button, Space, type TableColumnsType } from 'antd';

import { ACCESS_STATUS, type AccessDomain, type AccessUser } from '@/api/access';
import { COMMON_COPY, IdentityCell } from '@/ui';

import { buildActionsColumn, buildRoleColumn, buildStatusColumn } from '../columns';
import { COPY, DOMAIN_COLUMN, USER_COLUMN } from '../constants';
import { getUserIdentity, getUserLabel } from '../utils';

import type { DomainColumnActions, UserColumnActions } from './types';

const renderLocalPassword = (user: AccessUser, actions: UserColumnActions) => {
  const copy = COPY.users.localPassword;
  const name = getUserLabel(user);
  if (user.status !== ACCESS_STATUS.ACTIVE) return COMMON_COPY.emptyValue;
  if (user.hasLocalCredential) {
    return (
      <Space size="small">
        {actions.localAuthEnabled && (
          <Button size="small" aria-label={copy.resetFor(name)} onClick={() => actions.onResetLocalCredential(user)}>
            {copy.reset}
          </Button>
        )}
        <Button
          type="text"
          danger
          aria-label={copy.removeFor(name)}
          onClick={() => actions.onRemoveLocalCredential(user)}
        >
          {copy.remove}
        </Button>
      </Space>
    );
  }
  return actions.localAuthEnabled ? (
    <Button size="small" onClick={() => actions.onAddLocalCredential(user)}>
      {copy.add}
    </Button>
  ) : (
    COMMON_COPY.emptyValue
  );
};

export const getUserColumns = (actions: UserColumnActions): TableColumnsType<AccessUser> => [
  {
    key: USER_COLUMN.USER,
    title: COPY.users.columns.user,
    render: (_, user) => {
      const { primary, secondary } = getUserIdentity(user);
      return <IdentityCell primary={primary || COPY.users.pendingFirstLogin} secondary={secondary} />;
    },
  },
  buildRoleColumn<AccessUser>({
    key: USER_COLUMN.ROLE,
    title: COPY.users.columns.role,
    getRole: (user) => user.role,
    getLabel: (user) => COPY.users.roleFor(getUserLabel(user)),
    onChange: actions.onRoleChange,
  }),
  buildStatusColumn<AccessUser>({
    key: USER_COLUMN.STATUS,
    title: COPY.users.columns.status,
    getStatus: (user) => user.status,
    labels: COPY.users.status,
    filter: actions.statusFilter,
  }),
  {
    key: USER_COLUMN.LOCAL_PASSWORD,
    title: COPY.users.columns.localPassword,
    render: (_, user) => renderLocalPassword(user, actions),
  },
  buildActionsColumn<AccessUser>({
    key: USER_COLUMN.ACTIONS,
    title: COPY.users.columns.actions,
    getStatus: (user) => user.status,
    getName: getUserLabel,
    labels: {
      enable: COPY.actions.enable,
      disable: COPY.actions.disable,
      enableFor: COPY.users.enable,
      disableFor: COPY.users.disable,
      removeFor: COPY.users.remove,
    },
    onToggle: actions.onStatusChange,
    onRemove: actions.onRemove,
  }),
];

export const getDomainColumns = (actions: DomainColumnActions): TableColumnsType<AccessDomain> => [
  { key: DOMAIN_COLUMN.DOMAIN, title: COPY.domains.columns.domain, dataIndex: 'domain' },
  buildRoleColumn<AccessDomain>({
    key: DOMAIN_COLUMN.ROLE,
    title: COPY.domains.columns.defaultRole,
    getRole: (domain) => domain.defaultRole,
    getLabel: (domain) => COPY.domains.roleFor(domain.domain),
    onChange: actions.onRoleChange,
  }),
  buildStatusColumn<AccessDomain>({
    key: DOMAIN_COLUMN.STATUS,
    title: COPY.domains.columns.status,
    getStatus: (domain) => domain.status,
    labels: COPY.domains.status,
  }),
  buildActionsColumn<AccessDomain>({
    key: DOMAIN_COLUMN.ACTIONS,
    title: COPY.domains.columns.actions,
    getStatus: (domain) => domain.status,
    getName: (domain) => domain.domain,
    labels: {
      enable: COPY.actions.enable,
      disable: COPY.actions.disable,
      enableFor: COPY.domains.enable,
      disableFor: COPY.domains.disable,
      removeFor: COPY.domains.remove,
    },
    onToggle: actions.onStatusChange,
    onRemove: actions.onRemove,
  }),
];
