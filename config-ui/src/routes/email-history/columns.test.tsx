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

import { fireEvent, screen } from '@testing-library/react';
import type { TableColumnsType } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { getColumns } from './columns';
import { COPY, EMAIL_STATUS, HISTORY_COLUMN } from './constants';
import type { EmailHistoryItem } from './types';

const EMAIL: EmailHistoryItem = {
  id: 7,
  sender: 'devlake-alerts@arbisoft.com',
  recipients: ['a@arbisoft.com', 'b@arbisoft.com', 'c@arbisoft.com', 'd@arbisoft.com'],
  subject: '[DevLake alert] Test email',
  status: 'FAILED',
  sentOn: null,
  sentBy: 'admin@arbisoft.com',
  template: 'alert',
  projectName: null,
  source: 'mail_test',
  sourceId: null,
  provider: 'smtp:smtp.gmail.com',
  providerMessageId: null,
  errorMessage: '535 auth failed',
  attempts: 1,
  nextAttemptAt: null,
  createdAt: '2026-11-24T10:00:00Z',
  updatedAt: '2026-11-24T10:00:00Z',
};

const column = (columns: TableColumnsType<EmailHistoryItem>, key: string) => columns.find((item) => item.key === key);

const renderCell = (key: string, record: EmailHistoryItem, onOpen = vi.fn()) => {
  const col = column(getColumns(onOpen), key);
  const value = col && 'dataIndex' in col ? record[col.dataIndex as keyof EmailHistoryItem] : undefined;
  return renderWithTheme(<>{col && 'render' in col && col.render?.(value, record, 0)}</>);
};

describe('Email history columns', () => {
  it('has the planned columns in order', () => {
    expect(getColumns(vi.fn()).map((item) => item.title)).toEqual([
      COPY.columns.sentOn,
      COPY.columns.template,
      COPY.columns.subject,
      COPY.columns.recipients,
      COPY.columns.status,
      COPY.columns.sentBy,
    ]);
  });

  it('sorts on sent on, template, subject and status', () => {
    expect(
      getColumns(vi.fn())
        .filter((item) => 'sorter' in item && item.sorter)
        .map((item) => item.key),
    ).toEqual([HISTORY_COLUMN.SENT_ON, HISTORY_COLUMN.TEMPLATE, HISTORY_COLUMN.SUBJECT, HISTORY_COLUMN.STATUS]);
  });

  it('marks an email that was never sent', () => {
    renderCell(HISTORY_COLUMN.SENT_ON, EMAIL);
    expect(screen.getByText(COPY.notSent)).toBeTruthy();
  });

  it('shows the first recipients and counts the rest', () => {
    renderCell(HISTORY_COLUMN.RECIPIENTS, EMAIL);
    expect(screen.getByText('a@arbisoft.com, b@arbisoft.com')).toBeTruthy();
    expect(screen.getByText(COPY.moreRecipients(2))).toBeTruthy();
  });

  it('labels the status', () => {
    renderCell(HISTORY_COLUMN.STATUS, EMAIL);
    expect(screen.getByText(EMAIL_STATUS.FAILED.label)).toBeTruthy();
  });

  it('opens the email from its subject', () => {
    const onOpen = vi.fn();
    renderCell(HISTORY_COLUMN.SUBJECT, EMAIL, onOpen);
    fireEvent.click(screen.getByRole('button', { name: COPY.openEmail(EMAIL.subject) }));
    expect(onOpen).toHaveBeenCalledWith(EMAIL);
  });
});
