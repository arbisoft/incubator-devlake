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

import { EditOutlined, EyeOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';

import type { IConnection } from '@/types';
import { IconButton } from '@/ui';

import { ConnectionStatus } from '../connection-status';

import { COLUMN_KEY, COPY } from './constants';
import { RepoCountCell } from './repo-count-cell';
import type { RepoCounts } from './types';

type ColumnOptions = {
  counts: RepoCounts;
  onLoadCount: (connection: IConnection) => void;
  onDetails: (connection: IConnection) => void;
  onEdit: (connection: IConnection) => void;
};

export const getColumns = ({
  counts,
  onLoadCount,
  onDetails,
  onEdit,
}: ColumnOptions): TableColumnsType<IConnection> => [
  { key: COLUMN_KEY.NAME, title: COPY.columns.name, dataIndex: 'name', sorter: true },
  {
    key: COLUMN_KEY.STATUS,
    title: COPY.columns.status,
    render: (_, connection) => <ConnectionStatus connection={connection} />,
  },
  {
    key: COLUMN_KEY.REPOS,
    title: COPY.columns.repos,
    render: (_, connection) => (
      <RepoCountCell connection={connection} count={counts[connection.unique]} onVisible={onLoadCount} />
    ),
  },
  {
    key: COLUMN_KEY.ACTIONS,
    title: COPY.columns.actions,
    align: 'right',
    render: (_, connection) => (
      <>
        <IconButton
          icon={<EyeOutlined />}
          label={COPY.detailsFor(connection.name)}
          onClick={() => onDetails(connection)}
        />
        <IconButton icon={<EditOutlined />} label={COPY.editFor(connection.name)} onClick={() => onEdit(connection)} />
      </>
    ),
  },
];
