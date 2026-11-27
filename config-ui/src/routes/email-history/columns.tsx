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

import { CellButton, StatusBadge } from '@/ui';
import { formatTime } from '@/utils';

import { COPY, DATE_FORMAT, HISTORY_COLUMN } from './constants';
import { Muted, Recipients } from './styled';
import type { EmailHistoryItem } from './types';
import { getStatusLabel, getStatusTone, getTemplateLabel, summarizeRecipients } from './utils';

export const getColumns = (onOpen: (row: EmailHistoryItem) => void): TableColumnsType<EmailHistoryItem> => [
  {
    key: HISTORY_COLUMN.SENT_ON,
    title: COPY.columns.sentOn,
    dataIndex: 'sentOn',
    sorter: true,
    render: (sentOn: string | null) => (sentOn ? formatTime(sentOn, DATE_FORMAT) : <Muted>{COPY.notSent}</Muted>),
  },
  {
    key: HISTORY_COLUMN.TEMPLATE,
    title: COPY.columns.template,
    dataIndex: 'template',
    sorter: true,
    render: (template: string) => getTemplateLabel(template),
  },
  {
    key: HISTORY_COLUMN.SUBJECT,
    title: COPY.columns.subject,
    dataIndex: 'subject',
    sorter: true,
    render: (_, row) => (
      <CellButton aria-label={COPY.openEmail(row.subject)} onClick={() => onOpen(row)}>
        {row.subject}
      </CellButton>
    ),
  },
  {
    key: HISTORY_COLUMN.RECIPIENTS,
    title: COPY.columns.recipients,
    dataIndex: 'recipients',
    render: (recipients: string[]) => {
      const { shown, more } = summarizeRecipients(recipients);
      return (
        <Recipients title={recipients.join(', ')}>
          <span>{shown}</span>
          {more > 0 && <Muted>{COPY.moreRecipients(more)}</Muted>}
        </Recipients>
      );
    },
  },
  {
    key: HISTORY_COLUMN.STATUS,
    title: COPY.columns.status,
    dataIndex: 'status',
    sorter: true,
    render: (status: string) => (
      <StatusBadge tone={getStatusTone(status)} label={getStatusLabel(status)} variant="dot" />
    ),
  },
  { key: HISTORY_COLUMN.SENT_BY, title: COPY.columns.sentBy, dataIndex: 'sentBy' },
];
