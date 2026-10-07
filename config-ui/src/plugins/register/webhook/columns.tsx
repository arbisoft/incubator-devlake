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

import { DeleteOutlined, EyeOutlined, FormOutlined } from '@ant-design/icons';
import { Button, type TableColumnsType } from 'antd';

import type { IWebhook } from '@/types';
import { IconButton } from '@/ui';

import { COLUMN_KEY, COPY, WEBHOOK_DIALOG } from './constants';
import type { WebhookDialogKind } from './types';

type ColumnOptions = {
  onOpen: (dialog: WebhookDialogKind, webhook: IWebhook) => void;
};

export const getColumns = ({ onOpen }: ColumnOptions): TableColumnsType<IWebhook> => [
  { key: COLUMN_KEY.ID, title: COPY.columns.id, dataIndex: 'id' },
  {
    key: COLUMN_KEY.NAME,
    title: COPY.columns.name,
    dataIndex: 'name',
    render: (name: string, webhook) => (
      <Button type="link" onClick={() => onOpen(WEBHOOK_DIALOG.VIEW, webhook)}>
        {name}
      </Button>
    ),
  },
  {
    key: COLUMN_KEY.ACTIONS,
    align: 'right',
    render: (_, webhook) => (
      <>
        <IconButton
          icon={<EyeOutlined />}
          label={COPY.actions.view(webhook.name)}
          onClick={() => onOpen(WEBHOOK_DIALOG.VIEW, webhook)}
        />
        <IconButton
          icon={<FormOutlined />}
          label={COPY.actions.edit(webhook.name)}
          onClick={() => onOpen(WEBHOOK_DIALOG.EDIT, webhook)}
        />
        <IconButton
          icon={<DeleteOutlined />}
          label={COPY.actions.remove(webhook.name)}
          danger
          onClick={() => onOpen(WEBHOOK_DIALOG.DELETE, webhook)}
        />
      </>
    ),
  },
];
