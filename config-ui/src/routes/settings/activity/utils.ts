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

import type { AccessAuditEvent } from '@/api/access';
import { COMMON_COPY, SHORT_DATE_TIME_FORMAT, formatDateTime } from '@/ui';

import { COPY } from './constants';
import type { ActivityRow } from './types';

export const toActivityRow = (event: AccessAuditEvent): ActivityRow => ({
  id: event.id,
  when: formatDateTime(event.createdAt, SHORT_DATE_TIME_FORMAT),
  action: event.action,
  actor: event.actorEmail || COPY.system,
  target: event.targetEmail || COMMON_COPY.emptyValue,
  detail: event.detail || COMMON_COPY.emptyValue,
  event,
});

export const filterActivityRows = (rows: ActivityRow[], keyword: string) => {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(({ action, actor, target, detail }) =>
    [action, actor, target, detail].some((value) => value.toLowerCase().includes(needle)),
  );
};

export const paginateRows = <T>(rows: T[], page: number, pageSize: number) =>
  rows.slice((page - 1) * pageSize, page * pageSize);
