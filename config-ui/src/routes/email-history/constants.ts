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

import { STATUS_TONE } from '@/ui';
import type { StatusTone } from '@/ui/types';

import type { EmailStatus, HistoryFilters } from './types';

export const HISTORY_COLUMN = {
  SENT_ON: 'sentOn',
  TEMPLATE: 'template',
  SUBJECT: 'subject',
  RECIPIENTS: 'recipients',
  STATUS: 'status',
  SENT_BY: 'sentBy',
} as const;

export const FILTER_PARAM = {
  STATUS: 'status',
  TEMPLATE: 'template',
  PROJECT: 'projectName',
  FROM: 'from',
  TO: 'to',
} as const;

export const DEFAULT_FILTERS: HistoryFilters = { status: '', template: '', projectName: '', from: '', to: '' };

export const EMAIL_STATUS = { QUEUED: 'QUEUED', SENT: 'SENT', FAILED: 'FAILED' } as const satisfies Record<
  EmailStatus,
  EmailStatus
>;

export const STATUS_TONES: Record<EmailStatus, StatusTone> = {
  QUEUED: STATUS_TONE.INFO,
  SENT: STATUS_TONE.SUCCESS,
  FAILED: STATUS_TONE.ERROR,
};

export const TEMPLATES = ['alert', 'report', 'project_invite'] as const;

// The mail driver that logs emails instead of sending them.
export const DRIVER_LOG = 'log';

// How often a page or drawer showing a queued email checks for its result.
export const QUEUED_POLL_MS = 5000;

// Projects offered at once in the project filter; typing searches the server for the rest.
export const PROJECT_OPTIONS_LIMIT = 50;

export const DATE_FORMAT = 'YYYY-MM-DD HH:mm';

// Recipients shown in the table before "+N more".
export const RECIPIENTS_SHOWN = 2;

// Blocks scripts, forms, popups and same-origin access, so stored HTML can't act on the page.
export const PREVIEW_SANDBOX = '';

export const COPY = {
  title: 'Email History',
  description: 'Every email DevLake sent or tried to send.',
  tableLabel: 'Sent emails',
  searchPlaceholder: 'Search recipient or subject',
  columns: {
    sentOn: 'Sent On',
    template: 'Template',
    subject: 'Subject',
    recipients: 'Recipients',
    status: 'Status',
    sentBy: 'Sent By',
  },
  statusLabels: { QUEUED: 'Queued', SENT: 'Sent', FAILED: 'Failed' } as Record<EmailStatus, string>,
  templateLabels: { alert: 'Alert', report: 'Report', project_invite: 'Project invite' } as Record<string, string>,
  filters: {
    status: 'Status',
    template: 'Template',
    project: 'Project',
    dateRange: ['Created from', 'Created to'] as [string, string],
  },
  notSent: 'Not sent',
  moreRecipients: (n: number) => `+${n} more`,
  openEmail: (subject: string) => `Open email ${subject}`,
  empty: { title: 'No emails yet', description: 'Emails DevLake sends, including test emails, will appear here.' },
  noResults: {
    title: 'No emails match your filters',
    description: 'Try a different status, template, project or date.',
  },
  banner: {
    on: (host: string) => `Mail is on and sends through ${host}.`,
    onLog: 'Mail is on with the log driver: emails are written to the server log, not sent.',
    off: 'Mail is off. Set MAIL_ENABLED and the SMTP settings in the server config to turn it on.',
    offReason: (reason: string) => `Mail is off: ${reason}`,
    failed: 'The mail status could not be loaded.',
    sendTest: 'Send test email',
    testQueued: 'Test email queued. Its status changes to Sent or Failed once it is tried.',
  },
  drawer: {
    title: 'Email detail',
    close: 'Close',
    loadFailed: 'The email could not be loaded.',
    error: 'Error',
    preview: 'Preview',
    previewTitle: (subject: string) => `Preview of ${subject}`,
    plainText: 'Plain text',
    fields: {
      subject: 'Subject',
      status: 'Status',
      from: 'From',
      recipients: 'Recipients',
      template: 'Template',
      project: 'Project',
      source: 'Source',
      sentBy: 'Sent by',
      created: 'Created',
      sentOn: 'Sent on',
      attempts: 'Attempts',
      nextAttempt: 'Next attempt',
      provider: 'Provider',
      messageId: 'Message ID',
    },
  },
};
