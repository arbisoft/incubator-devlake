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

import { Button, type TableColumnsType } from 'antd';

import type { IApiKey } from '@/types';
import { StatusBadge } from '@/ui';
import { formatTime } from '@/utils';

import { COPY, DATE_FORMAT, KEY_COLUMN } from './constants';
import { ExpirationCell, PathText } from './styled';
import { getExpiryState, getExpiryTone } from './utils';

type ColumnOptions = {
  pathPrefix: string;
  onRevoke: (key: IApiKey) => void;
};

export const getColumns = ({ pathPrefix, onRevoke }: ColumnOptions): TableColumnsType<IApiKey> => [
  { key: KEY_COLUMN.NAME, title: COPY.columns.name, dataIndex: 'name' },
  {
    key: KEY_COLUMN.EXPIRATION,
    title: COPY.columns.expiration,
    dataIndex: 'expiredAt',
    sorter: true,
    render: (expiredAt?: string) => {
      const tone = getExpiryTone(getExpiryState(expiredAt));
      return (
        <ExpirationCell>
          <span>{expiredAt ? formatTime(expiredAt, DATE_FORMAT) : COPY.noExpiration}</span>
          {tone && <StatusBadge tone={tone} label={COPY.expired} variant="dot" />}
        </ExpirationCell>
      );
    },
  },
  {
    key: KEY_COLUMN.ALLOWED_PATH,
    title: COPY.columns.allowedPath,
    dataIndex: 'allowedPath',
    render: (allowedPath: string) => <PathText>{`${pathPrefix}${allowedPath}`}</PathText>,
  },
  {
    key: KEY_COLUMN.ACTIONS,
    align: 'right',
    render: (_, key) => (
      <Button danger aria-label={COPY.revokeKey(key.name)} onClick={() => onRevoke(key)}>
        {COPY.revoke}
      </Button>
    ),
  },
];
