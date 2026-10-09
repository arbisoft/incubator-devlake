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

import { SettingOutlined } from '@ant-design/icons';
import { Button, Tooltip, type TableColumnsType } from 'antd';
import { Link } from 'react-router-dom';

import { TextTooltip } from '@/components';
import { getCron, PATHS } from '@/config';
import { ConnectionName } from '@/features';
import { IBPMode, type IBlueprint } from '@/types';
import { OverflowList, RowLink, StatusBadge } from '@/ui';
import { formatTime } from '@/utils';

import {
  BLUEPRINT_COLUMN,
  BLUEPRINT_STATUS_TONE,
  CONFIGURATION_TAB_STATE,
  COPY,
  MAX_VISIBLE_CONNECTIONS,
} from './constants';
import { toStatusKey } from './utils';

type ColumnOptions = { onConfigure: (id: ID) => void };

const renderConnections = ({ mode, connections }: Pick<IBlueprint, 'mode' | 'connections'>) => {
  if (mode === IBPMode.ADVANCED) return COPY.advancedMode;
  if (!connections.length) return COPY.notAvailable;
  return (
    <OverflowList
      max={MAX_VISIBLE_CONNECTIONS}
      moreLabel={COPY.moreConnections}
      items={connections.map(({ pluginName, connectionId }) => ({
        key: `${pluginName}-${connectionId}`,
        node: <ConnectionName plugin={pluginName} connectionId={connectionId} />,
      }))}
    />
  );
};

export const getColumns = ({ onConfigure }: ColumnOptions): TableColumnsType<IBlueprint> => [
  {
    key: BLUEPRINT_COLUMN.NAME,
    title: COPY.columns.name,
    dataIndex: 'name',
    sorter: true,
    render: (name: string, { id }) => (
      <RowLink to={PATHS.BLUEPRINT(id)} state={CONFIGURATION_TAB_STATE}>
        <TextTooltip content={name}>{name}</TextTooltip>
      </RowLink>
    ),
  },
  { key: BLUEPRINT_COLUMN.CONNECTIONS, title: COPY.columns.connections, render: (_, row) => renderConnections(row) },
  {
    key: BLUEPRINT_COLUMN.FREQUENCY,
    title: COPY.columns.frequency,
    render: (_, { isManual, cronConfig }) => getCron(isManual, cronConfig).label,
  },
  {
    key: BLUEPRINT_COLUMN.NEXT_RUN,
    title: COPY.columns.nextRun,
    render: (_, { isManual, cronConfig }) => formatTime(getCron(isManual, cronConfig).nextTime),
  },
  {
    key: BLUEPRINT_COLUMN.PROJECT,
    title: COPY.columns.project,
    dataIndex: 'projectName',
    render: (projectName?: string) =>
      projectName ? (
        <Link to={PATHS.PROJECT(projectName)}>
          <TextTooltip content={projectName}>{projectName}</TextTooltip>
        </Link>
      ) : (
        COPY.notAvailable
      ),
  },
  {
    key: BLUEPRINT_COLUMN.STATUS,
    title: COPY.columns.status,
    dataIndex: 'enable',
    render: (enable: boolean) => {
      const status = toStatusKey(enable);
      return <StatusBadge tone={BLUEPRINT_STATUS_TONE[status]} label={COPY.statusFilter[status]} variant="dot" />;
    },
  },
  {
    key: BLUEPRINT_COLUMN.ACTION,
    title: COPY.columns.action,
    align: 'center',
    render: (_, { id }) => (
      <Tooltip title={COPY.configure}>
        <Button type="text" icon={<SettingOutlined />} aria-label={COPY.configure} onClick={() => onConfigure(id)} />
      </Tooltip>
    ),
  },
];
