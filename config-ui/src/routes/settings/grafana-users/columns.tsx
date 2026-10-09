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

import type { GrafanaUser } from '@/api/grafana-users';
import { COMMON_COPY, IdentityCell, OverflowList, STATUS_BADGE_VARIANT, STATUS_TONE, StatusBadge } from '@/ui';

import { buildStatusColumn } from '../columns';

import { COPY, GRAFANA_USER_COLUMN, MAX_VISIBLE_PROJECTS } from './constants';
import { getUserIdentity, toUserStatus } from './utils';

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

const renderProjects = ({ projects }: GrafanaUser) =>
  projects.length === 0 ? (
    COMMON_COPY.emptyValue
  ) : (
    <OverflowList
      max={MAX_VISIBLE_PROJECTS}
      moreLabel={COPY.moreProjects}
      items={projects.map((project) => ({
        key: project,
        node: <StatusBadge tone={STATUS_TONE.NEUTRAL} label={project} variant={STATUS_BADGE_VARIANT.TEXT} />,
      }))}
    />
  );

export const getGrafanaUserColumns = (): TableColumnsType<GrafanaUser> => [
  { key: GRAFANA_USER_COLUMN.USER, title: COPY.columns.user, render: (_, user) => renderUser(user) },
  { key: GRAFANA_USER_COLUMN.ROLE, title: COPY.columns.role, dataIndex: 'role' },
  { key: GRAFANA_USER_COLUMN.PROJECTS, title: COPY.columns.projects, render: (_, user) => renderProjects(user) },
  buildStatusColumn<GrafanaUser>({
    key: GRAFANA_USER_COLUMN.STATUS,
    title: COPY.columns.status,
    getStatus: toUserStatus,
    labels: COPY.status,
  }),
];
