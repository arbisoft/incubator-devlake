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

import { getCron, PATHS } from '@/config';
import { ConnectionName } from '@/features';
import { PipelineStatusBadge } from '@/routes/pipeline';
import { OverflowList, RowLink } from '@/ui';
import { formatTime } from '@/utils';

import { OtelConnectionName } from './components';
import {
  CONFIGURATION_TAB_STATE,
  CONNECTION_ENTRY_KIND,
  COPY,
  MAX_VISIBLE_CONNECTIONS,
  NO_CONNECTIONS,
  PROJECT_COLUMN,
} from './constants';
import type { ProjectRow } from './types';
import { getConnectionEntries } from './utils';

export const useProjectColumns = (onConfigure: (name: string) => void) => {
  const nameRef = useRef<HTMLAnchorElement>(null);
  const connectionRef = useRef<HTMLUListElement>(null);
  const configRef = useRef<HTMLButtonElement>(null);

  const columns = useMemo<TableColumnsType<ProjectRow>>(
    () => [
      {
        key: PROJECT_COLUMN.NAME,
        title: COPY.columns.name,
        dataIndex: 'name',
        sorter: true,
        render: (name: string) => (
          <RowLink to={PATHS.PROJECT(name)} state={CONFIGURATION_TAB_STATE} ref={nameRef}>
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
            <OverflowList
              listRef={connectionRef}
              max={MAX_VISIBLE_CONNECTIONS}
              moreLabel={COPY.moreConnections}
              items={entries.map(({ key, ...entry }) => ({
                key,
                node:
                  entry.kind === CONNECTION_ENTRY_KIND.PLUGIN ? (
                    <ConnectionName plugin={entry.connection.pluginName} connectionId={entry.connection.connectionId} />
                  ) : (
                    <OtelConnectionName connection={entry.connection} />
                  ),
              }))}
            />
          );
        },
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
    [onConfigure],
  );

  return { columns, tourRefs: { nameRef, connectionRef, configRef } };
};
