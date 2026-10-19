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

import { CONFIRM_TONE } from '@/ui/confirm-modal';
import type { ConfirmConfig } from '@/ui/types';

import { DELETE_KIND, DETAIL_COPY, HTTP_STATUS, MAX_LISTED_SCOPES } from './constants';
import type { BulkOutcome, BulkSummary, DeleteFailure, DeletePending } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const toNames = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

// The connection thunk rejects with the response body and status; a scope delete rejects with the axios error.
export const readDeleteFailure = (error: unknown): DeleteFailure => {
  if (!isRecord(error)) return { conflict: false, names: [] };
  const response = isRecord(error.response) ? error.response : undefined;
  const body = response && isRecord(response.data) ? response.data : error;
  const status = response ? response.status : error.status;
  const detail = isRecord(body.data) ? body.data : {};
  return {
    conflict: status === HTTP_STATUS.CONFLICT,
    names: [...toNames(detail.projects), ...toNames(detail.blueprints)],
  };
};

export const summarizeBulkDelete = (outcomes: BulkOutcome[]): BulkSummary => ({
  succeeded: outcomes.filter((outcome) => outcome.error === undefined).length,
  failures: outcomes.filter((outcome) => outcome.error !== undefined),
});

export const toDeleteConfirm = (pending: DeletePending): { config: ConfirmConfig; name: string } => {
  const copy = DETAIL_COPY.confirm;
  switch (pending.kind) {
    case DELETE_KIND.CONNECTION:
      return { config: { tone: CONFIRM_TONE.DANGER, ...copy[pending.kind] }, name: pending.name };
    case DELETE_KIND.SCOPE_CLEAR:
    case DELETE_KIND.SCOPE_DELETE:
      return { config: { tone: CONFIRM_TONE.DANGER, ...copy[pending.kind] }, name: pending.scope.name };
    case DELETE_KIND.SCOPES_BULK: {
      const { scopes } = pending;
      const listed = scopes.slice(0, MAX_LISTED_SCOPES).map((scope) => scope.name);
      return {
        name: '',
        config: {
          tone: CONFIRM_TONE.DANGER,
          title: () => copy[pending.kind].title(scopes.length),
          description: () => copy[pending.kind].description(listed.join(', '), scopes.length - listed.length),
          confirm: copy[pending.kind].confirm,
        },
      };
    }
  }
};
