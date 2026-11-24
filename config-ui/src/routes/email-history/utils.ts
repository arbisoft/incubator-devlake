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

import dayjs, { type Dayjs } from 'dayjs';

import type { HistoryParams } from '@/api/mail';
import { STATUS_TONE, type ListQuery } from '@/ui';
import type { StatusTone } from '@/ui/types';

import { COPY, DRIVER_LOG, EMAIL_STATUS, RECIPIENTS_SHOWN, STATUS_TONES } from './constants';
import type { EmailHistoryItem, EmailStatus, HistoryFilters, HistorySortKey, MailStatus } from './types';

const orUndefined = (value: string) => (value === '' ? undefined : value);

// buildHistoryQuery maps the list state to GET /mail/history params; the search box is the API's search.
export const buildHistoryQuery = (query: ListQuery<HistorySortKey>, filters: HistoryFilters): HistoryParams => ({
  page: query.page,
  pageSize: query.pageSize,
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,
  search: query.keyword,
  status: orUndefined(filters.status) as EmailStatus | undefined,
  template: orUndefined(filters.template),
  projectName: orUndefined(filters.projectName),
  from: orUndefined(filters.from),
  to: orUndefined(filters.to),
});

export const getStatusTone = (status: string): StatusTone => STATUS_TONES[status as EmailStatus] ?? STATUS_TONE.NEUTRAL;

export const getStatusLabel = (status: string) => COPY.statusLabels[status as EmailStatus] ?? status;

export const getTemplateLabel = (template: string) => COPY.templateLabels[template] ?? template;

// summarizeRecipients shows the first few addresses and counts the rest.
export const summarizeRecipients = (recipients: string[]) => ({
  shown: recipients.slice(0, RECIPIENTS_SHOWN).join(', '),
  more: Math.max(recipients.length - RECIPIENTS_SHOWN, 0),
});

// RFC 3339 without milliseconds, in UTC, as the API expects.
const toRFC3339 = (date: Dayjs) =>
  date
    .toDate()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

// toDateRange turns the picked days into a created-at range covering both whole local days.
// It takes plain dates because antd's date picker uses its own copy of dayjs.
export const toDateRange = (start?: Date | null, end?: Date | null) => ({
  from: start ? toRFC3339(dayjs(start).startOf('day')) : '',
  to: end ? toRFC3339(dayjs(end).endOf('day')) : '',
});

// getBanner says whether mail is on and where it sends.
export const getBanner = (status: MailStatus | undefined, failed: boolean): { tone: StatusTone; message: string } => {
  if (failed) return { tone: STATUS_TONE.ERROR, message: COPY.banner.failed };
  if (!status) return { tone: STATUS_TONE.NEUTRAL, message: '' };
  if (!status.enabled) {
    return status.disabledReason
      ? { tone: STATUS_TONE.WARNING, message: COPY.banner.offReason(status.disabledReason) }
      : { tone: STATUS_TONE.NEUTRAL, message: COPY.banner.off };
  }
  if (status.driver === DRIVER_LOG) return { tone: STATUS_TONE.INFO, message: COPY.banner.onLog };
  const host = status.port ? `${status.host}:${status.port}` : (status.host ?? status.driver);
  return { tone: STATUS_TONE.SUCCESS, message: COPY.banner.on(host) };
};

type HistoryPage = { items: EmailHistoryItem[]; count: number };

// queuedChanged says whether a fresh copy of the page differs for any row that was queued: it moved,
// left the page, or was updated. A change in the total also counts. Rows that weren't queued are ignored.
export const queuedChanged = (shown: HistoryPage, fresh: HistoryPage) => {
  if (fresh.count !== shown.count) return true;
  const freshById = new Map(fresh.items.map((item) => [item.id, item]));
  return shown.items.some((item) => {
    if (item.status !== EMAIL_STATUS.QUEUED) return false;
    const now = freshById.get(item.id);
    return !now || now.status !== item.status || now.updatedAt !== item.updatedAt;
  });
};

export const hasQueued = (items: EmailHistoryItem[]) => items.some((item) => item.status === EMAIL_STATUS.QUEUED);
