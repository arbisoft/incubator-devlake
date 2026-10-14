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

import { EditOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';

import { ACCESS_STATUS } from '@/api/access';
import type { GrafanaRole, GrafanaUser } from '@/api/grafana-users';
import {
  COMMON_COPY,
  IconButton,
  IdentityCell,
  OVERFLOW_LAYOUT,
  OverflowList,
  STATUS_BADGE_VARIANT,
  STATUS_TONE,
  StatusBadge,
} from '@/ui';

import { buildActionsColumn, buildRoleColumn, buildStatusColumn } from '../columns';

import { GrafanaMoreMenu } from './components';
import { COPY, GRAFANA_ROLE_OPTIONS, GRAFANA_ROW_ACTION, GRAFANA_USER_COLUMN, MAX_VISIBLE_PROJECTS } from './constants';
import { ProjectChips, ProjectsCell } from './styled';
import type { GrafanaColumnActions } from './types';
import { getMenuActions, getUserIdentity, toUserStatus } from './utils';

const renderUser = (user: GrafanaUser) => {
  const { primary, secondary } = getUserIdentity(user);
  return (
    <IdentityCell
      primary={primary}
      secondary={secondary}
      adornment={
        user.sso && (
          <span role="img" aria-label={COPY.sso.label}>
            <StatusBadge tone={STATUS_TONE.INFO} label={COPY.sso.tag} variant={STATUS_BADGE_VARIANT.TEXT} />
          </span>
        )
      }
    />
  );
};

const renderProjects = (user: GrafanaUser, onEditProjects: GrafanaColumnActions['onEditProjects']) => (
  <ProjectsCell>
    {user.projects.length === 0 ? (
      COMMON_COPY.emptyValue
    ) : (
      <ProjectChips>
        <OverflowList
          max={MAX_VISIBLE_PROJECTS}
          layout={OVERFLOW_LAYOUT.INLINE}
          moreLabel={COPY.moreProjects}
          items={user.projects.map((project) => ({
            key: project,
            node: <StatusBadge tone={STATUS_TONE.NEUTRAL} label={project} variant={STATUS_BADGE_VARIANT.CHIP} />,
          }))}
        />
      </ProjectChips>
    )}
    <IconButton
      icon={<EditOutlined />}
      label={COPY.actions.editProjectsFor(user.email)}
      onClick={() => onEditProjects(user)}
    />
  </ProjectsCell>
);

export const getGrafanaUserColumns = (actions: GrafanaColumnActions): TableColumnsType<GrafanaUser> => [
  { key: GRAFANA_USER_COLUMN.USER, title: COPY.columns.user, render: (_, user) => renderUser(user) },
  buildRoleColumn<GrafanaUser, GrafanaRole>({
    key: GRAFANA_USER_COLUMN.ROLE,
    title: COPY.columns.role,
    options: GRAFANA_ROLE_OPTIONS,
    getRole: (user) => user.role,
    getLabel: (user) => COPY.actions.roleFor(user.email),
    getLockedReason: (user) => (user.protected ? COPY.actions.roleLocked : undefined),
    onChange: actions.onRoleChange,
  }),
  {
    key: GRAFANA_USER_COLUMN.PROJECTS,
    title: COPY.columns.projects,
    render: (_, user) => renderProjects(user, actions.onEditProjects),
  },
  buildStatusColumn<GrafanaUser>({
    key: GRAFANA_USER_COLUMN.STATUS,
    title: COPY.columns.status,
    getStatus: toUserStatus,
    labels: COPY.status,
  }),
  buildActionsColumn<GrafanaUser>({
    key: GRAFANA_USER_COLUMN.ACTIONS,
    title: COPY.columns.actions,
    getStatus: toUserStatus,
    getName: (user) => user.email,
    labels: {
      enable: COPY.actions.enable,
      disable: COPY.actions.disable,
      enableFor: COPY.actions.enableFor,
      disableFor: COPY.actions.disableFor,
      removeFor: COPY.actions.deleteFor,
    },
    canToggle: (user) => !user.protected,
    canRemove: (user) => !user.protected,
    renderExtra: (user) =>
      getMenuActions(user).length > 0 && (
        <GrafanaMoreMenu user={user} onSelect={(action) => actions.onMenuAction(user, action)} />
      ),
    onToggle: (user, status) =>
      actions.onToggle(status === ACCESS_STATUS.ACTIVE ? GRAFANA_ROW_ACTION.ENABLE : GRAFANA_ROW_ACTION.DISABLE, user),
    onRemove: actions.onRemove,
  }),
];
