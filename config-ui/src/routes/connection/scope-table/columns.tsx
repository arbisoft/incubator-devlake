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

import { ClearOutlined, DeleteOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';

import { PATHS } from '@/config';
import { ScopeConfig } from '@/plugins';
import { COMMON_COPY, ICON_BUTTON_TONE, IconButton, OverflowList, ROW_LINK_VARIANT, RowLink } from '@/ui';

import { COPY, MAX_VISIBLE_PROJECTS, SCOPE_COLUMN } from './constants';
import { ActionCell } from './styled';
import type { ScopeColumnOptions, ScopeRow } from './types';

export const getScopeColumns = ({
  plugin,
  connectionId,
  onScopeConfigChange,
  onClear,
  onDelete,
}: ScopeColumnOptions): TableColumnsType<ScopeRow> => {
  const columns: TableColumnsType<ScopeRow> = [
    { key: SCOPE_COLUMN.NAME, title: COPY.columns.name, dataIndex: 'name' },
    {
      key: SCOPE_COLUMN.PROJECTS,
      title: COPY.columns.projects,
      dataIndex: 'projects',
      render: (projects: string[]) =>
        projects.length === 0 ? (
          COMMON_COPY.emptyValue
        ) : (
          <OverflowList
            max={MAX_VISIBLE_PROJECTS}
            moreLabel={COPY.moreProjects}
            items={projects.map((project) => ({
              key: project,
              node: (
                <RowLink to={PATHS.PROJECT(project)} variant={ROW_LINK_VARIANT.LINK}>
                  {project}
                </RowLink>
              ),
            }))}
          />
        ),
    },
    {
      key: SCOPE_COLUMN.SCOPE_CONFIG,
      title: COPY.columns.scopeConfig,
      render: (_, { id, name, configId, configName }) => (
        <ScopeConfig
          plugin={plugin}
          connectionId={connectionId}
          scopeId={id}
          scopeName={name}
          scopeConfigId={configId}
          scopeConfigName={configName}
          onSuccess={onScopeConfigChange}
        />
      ),
    },
  ];

  if (onClear || onDelete) {
    columns.push({
      key: SCOPE_COLUMN.ACTIONS,
      title: COPY.columns.actions,
      align: 'right',
      render: (_, row) => (
        <ActionCell>
          {onClear && (
            <IconButton
              icon={<ClearOutlined />}
              label={COPY.clearData(row.name)}
              tone={ICON_BUTTON_TONE.PRIMARY}
              onClick={() => onClear(row)}
            />
          )}
          {onDelete && (
            <IconButton
              icon={<DeleteOutlined />}
              label={COPY.deleteScope(row.name)}
              tone={ICON_BUTTON_TONE.DANGER}
              onClick={() => onDelete(row)}
            />
          )}
        </ActionCell>
      ),
    });
  }

  return columns;
};
