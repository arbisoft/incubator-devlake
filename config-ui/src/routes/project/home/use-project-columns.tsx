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
import { useMemo, useRef } from 'react';

import { BLUEPRINT_VIEW, getCron, PATHS } from '@/config';
import { PipelineStatusBadge } from '@/routes/pipeline';
import { RowLink } from '@/ui';
import { formatTime } from '@/utils';

import type { ProjectReadiness } from '../readiness';

import { ConnectionsCell, ReadinessCell } from './components';
import { COPY, NO_CONNECTIONS, PROJECT_COLUMN } from './constants';
import type { ProjectRow } from './types';
import { getConnectionEntries } from './utils';

export const useProjectColumns = (onConfigure: (name: string) => void, readiness: Map<string, ProjectReadiness>) => {
  const nameRef = useRef<HTMLAnchorElement>(null);
  const connectionRef = useRef<HTMLButtonElement>(null);
  const configRef = useRef<HTMLButtonElement>(null);

  const columns = useMemo<TableColumnsType<ProjectRow>>(
    () => [
      {
        key: PROJECT_COLUMN.NAME,
        title: COPY.columns.name,
        dataIndex: 'name',
        sorter: true,
        render: (name: string) => (
          <RowLink to={PATHS.PROJECT_BLUEPRINT_VIEW(name, BLUEPRINT_VIEW.CONFIGURATION)} ref={nameRef}>
            {name}
          </RowLink>
        ),
      },
      {
        key: PROJECT_COLUMN.CONNECTIONS,
        title: COPY.columns.connections,
        render: (_, row) => {
          const entries = getConnectionEntries(row);
          return entries.length === 0 ? (
            NO_CONNECTIONS
          ) : (
            <ConnectionsCell entries={entries} buttonRef={connectionRef} />
          );
        },
      },
      {
        key: PROJECT_COLUMN.READINESS,
        title: COPY.columns.readiness,
        render: (_, { name }) => <ReadinessCell readiness={readiness.get(name)} />,
      },
      {
        key: PROJECT_COLUMN.FREQUENCY,
        title: COPY.columns.frequency,
        render: (_, { isManual, cronConfig }) => getCron(isManual, cronConfig).label,
      },
      {
        key: PROJECT_COLUMN.CREATED_AT,
        title: COPY.columns.createdAt,
        dataIndex: 'createdAt',
        sorter: true,
        render: (createdAt?: string) => formatTime(createdAt ?? null),
      },
      {
        key: PROJECT_COLUMN.LAST_RUN_AT,
        title: COPY.columns.lastRunAt,
        dataIndex: 'lastRunCompletedAt',
        sorter: true,
        render: (finishedAt?: string | null) => (finishedAt ? formatTime(finishedAt) : '-'),
      },
      {
        key: PROJECT_COLUMN.LAST_RUN_STATUS,
        title: COPY.columns.lastRunStatus,
        dataIndex: 'lastRunStatus',
        render: (status?: ProjectRow['lastRunStatus']) => (status ? <PipelineStatusBadge status={status} /> : '-'),
      },
      {
        key: PROJECT_COLUMN.ACTION,
        title: COPY.columns.action,
        align: 'center',
        render: (_, { name }) => (
          <Tooltip title={COPY.configure}>
            <Button
              ref={configRef}
              type="text"
              icon={<SettingOutlined />}
              aria-label={COPY.configure}
              onClick={() => onConfigure(name)}
            />
          </Tooltip>
        ),
      },
    ],
    [onConfigure, readiness],
  );

  return { columns, tourRefs: { nameRef, connectionRef, configRef } };
};
