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

import { request } from '@/utils';

import type { SortParams } from '../types';

import type { EmailHistoryDetail, EmailHistoryItem, EmailStatus, MailStatus, TestEmailResult } from './types';

export type { EmailHistoryDetail, EmailHistoryItem, EmailStatus, MailStatus, TestEmailResult } from './types';

export type HistorySortKey = 'createdAt' | 'sentOn' | 'status' | 'template' | 'subject';

export type HistoryParams = Pagination &
  SortParams<HistorySortKey> & {
    status?: EmailStatus;
    template?: string;
    projectName?: string;
    search?: string;
    from?: string;
    to?: string;
  };

type HistoryRes = {
  items: EmailHistoryItem[];
  count: number;
};

export const status = (signal?: AbortSignal): Promise<MailStatus> => request('/mail/status', { signal });

export const sendTest = (): Promise<TestEmailResult> => request('/mail/test', { method: 'POST' });

export const history = (data: HistoryParams, signal?: AbortSignal): Promise<HistoryRes> =>
  request('/mail/history', { data, signal });

export const historyEmail = (id: ID, signal?: AbortSignal): Promise<EmailHistoryDetail> =>
  request(`/mail/history/${id}`, { signal });
