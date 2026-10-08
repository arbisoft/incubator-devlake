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

import {
  ApartmentOutlined,
  CheckOutlined,
  DeleteOutlined,
  ReloadOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Tooltip, Typography, type TableColumnsType } from 'antd';

import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { LAYOUT } from '@/theme/scales';
import {
  ICON_BUTTON_TONE,
  IconButton,
  IdentityCell,
  OverflowList,
  STATUS_BADGE_VARIANT,
  StatusBadge,
  formatDateTime,
} from '@/ui';
import { STATUS_TONE } from '@/ui/constants';

import { CONNECTION_COLUMN, COPY, LIFECYCLE_ACTION, PROJECT_CHIP_LIMIT } from './constants';
import { ActionRow, TagRow } from './styled';
import { CONNECTION_STATE_TONE, CREDENTIAL_TONE } from './tones';
import type { ConnectionColumnActions } from './types';
import { getOtelConnectionStatus, isActionAllowed } from './utils';

const ACTION_BUTTONS = [
  { action: LIFECYCLE_ACTION.ROTATE, icon: <ReloadOutlined aria-hidden />, tone: ICON_BUTTON_TONE.DEFAULT },
  { action: LIFECYCLE_ACTION.APPLY, icon: <SyncOutlined aria-hidden />, tone: ICON_BUTTON_TONE.DEFAULT },
  { action: LIFECYCLE_ACTION.FINALIZE, icon: <CheckOutlined aria-hidden />, tone: ICON_BUTTON_TONE.DEFAULT },
  { action: LIFECYCLE_ACTION.REVOKE, icon: <StopOutlined aria-hidden />, tone: ICON_BUTTON_TONE.DANGER },
  { action: LIFECYCLE_ACTION.HIDE, icon: <DeleteOutlined aria-hidden />, tone: ICON_BUTTON_TONE.DANGER },
];

const renderProjects = ({ projects }: OtelConnectionResponse) => {
  if (projects.length === 0) {
    return (
      <Tooltip title={COPY.placement.unassignedHelp}>
        <span>
          <StatusBadge
            tone={STATUS_TONE.WARNING}
            label={COPY.placement.unassigned}
            variant={STATUS_BADGE_VARIANT.TEXT}
          />
        </span>
      </Tooltip>
    );
  }
  return (
    <TagRow>
      <OverflowList
        max={PROJECT_CHIP_LIMIT}
        moreLabel={COPY.placement.more}
        items={projects.map(({ name }) => ({
          key: name,
          node: <StatusBadge tone={STATUS_TONE.NEUTRAL} label={name} variant={STATUS_BADGE_VARIANT.TEXT} />,
        }))}
      />
      {projects.length > 1 && (
        <StatusBadge tone={STATUS_TONE.INFO} label={COPY.placement.shared} variant={STATUS_BADGE_VARIANT.TEXT} />
      )}
    </TagRow>
  );
};

const renderOrganization = ({ connection }: OtelConnectionResponse) =>
  connection.organizationId ? (
    <Tooltip title={COPY.organization.boundHelp}>
      <Typography.Text code copyable ellipsis>
        {connection.organizationId}
      </Typography.Text>
    </Tooltip>
  ) : (
    <Tooltip title={COPY.organization.pendingHelp}>
      <span>
        <StatusBadge tone={STATUS_TONE.NEUTRAL} label={COPY.organization.pending} variant={STATUS_BADGE_VARIANT.TEXT} />
      </span>
    </Tooltip>
  );

const renderCredentials = ({ credentials }: OtelConnectionResponse) => {
  const current = credentials.filter(({ status }) => status !== OTEL_STATUS.REVOKED);
  const shown =
    current.length > 0
      ? current.map(({ id, status }) => ({ key: String(id), status }))
      : [{ key: 'none', status: OTEL_STATUS.REVOKED }];
  return (
    <TagRow>
      {shown.map(({ key, status }) => (
        <StatusBadge
          key={key}
          tone={CREDENTIAL_TONE[status]}
          label={COPY.credentialStatus[status]}
          variant={STATUS_BADGE_VARIANT.DOT}
        />
      ))}
    </TagRow>
  );
};

export const getConnectionColumns = ({
  onManageProjects,
  onAction,
  onActionButtonRef,
}: ConnectionColumnActions): TableColumnsType<OtelConnectionResponse> => [
  {
    key: CONNECTION_COLUMN.TEAM,
    title: COPY.connections.columns.team,
    width: LAYOUT.otelTeamColumnWidth,
    render: (_, { connection }) => <IdentityCell primary={connection.teamName} secondary={connection.teamSlug} />,
  },
  {
    key: CONNECTION_COLUMN.STATUS,
    title: COPY.connections.columns.status,
    width: LAYOUT.otelStatusColumnWidth,
    render: (_, record) => {
      const state = getOtelConnectionStatus(record);
      return (
        <StatusBadge tone={CONNECTION_STATE_TONE[state]} label={COPY.state[state]} variant={STATUS_BADGE_VARIANT.DOT} />
      );
    },
  },
  {
    key: CONNECTION_COLUMN.CREDENTIALS,
    title: COPY.connections.columns.credentials,
    width: LAYOUT.otelCredentialsColumnWidth,
    render: (_, record) => renderCredentials(record),
  },
  {
    key: CONNECTION_COLUMN.PROJECTS,
    title: COPY.connections.columns.projects,
    width: LAYOUT.otelProjectsColumnWidth,
    render: (_, record) => renderProjects(record),
  },
  {
    key: CONNECTION_COLUMN.ORGANIZATION,
    title: COPY.connections.columns.organization,
    width: LAYOUT.otelOrganizationColumnWidth,
    render: (_, record) => renderOrganization(record),
  },
  {
    key: CONNECTION_COLUMN.ENDPOINT,
    title: COPY.connections.columns.endpoint,
    width: LAYOUT.otelEndpointColumnWidth,
    dataIndex: ['connection', 'collectorEndpoint'],
    ellipsis: true,
  },
  {
    key: CONNECTION_COLUMN.UPDATED,
    title: COPY.connections.columns.updated,
    width: LAYOUT.otelUpdatedColumnWidth,
    dataIndex: ['connection', 'updatedAt'],
    render: (value: string) => formatDateTime(value),
  },
  {
    key: CONNECTION_COLUMN.ACTIONS,
    title: COPY.connections.columns.actions,
    width: LAYOUT.otelActionsColumnWidth,
    align: 'center',
    render: (_, record) => (
      <ActionRow>
        <IconButton
          icon={<ApartmentOutlined aria-hidden />}
          label={COPY.actions.projects(record.connection.teamName)}
          onClick={() => onManageProjects(record)}
        />
        {ACTION_BUTTONS.map(({ action, icon, tone }) => (
          <IconButton
            key={action}
            icon={icon}
            tone={tone}
            label={COPY.actions[action](record.connection.teamName)}
            buttonRef={(button) => onActionButtonRef(record.connection.id, action, button)}
            disabled={!isActionAllowed(action, record)}
            onClick={() => onAction(action, record)}
          />
        ))}
      </ActionRow>
    ),
  },
];
