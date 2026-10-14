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

import { describe, expect, it } from 'vitest';

import { CONFIRM_TONE } from '@/ui/confirm-modal';

import { DELETE_KIND, DETAIL_COPY, MAX_LISTED_SCOPES } from './constants';
import { readDeleteFailure, summarizeBulkDelete, toDeleteConfirm } from './delete-utils';
import type { ScopeRow } from './scope-table';

const scope = (id: number): ScopeRow => ({ id: String(id), name: `scope-${id}`, projects: [] });

describe('readDeleteFailure', () => {
  it('reads a scope conflict from the axios response', () => {
    const error = {
      response: { status: 409, data: { message: 'in use', data: { projects: ['p1'], blueprints: ['b1', 'b2'] } } },
    };
    expect(readDeleteFailure(error)).toEqual({ conflict: true, names: ['p1', 'b1', 'b2'] });
  });

  it('reads a connection conflict from the rejected thunk payload', () => {
    const payload = { status: 409, message: 'in use', data: { projects: ['p1'], blueprints: [] } };
    expect(readDeleteFailure(payload)).toEqual({ conflict: true, names: ['p1'] });
  });

  it('treats a conflict without a detail body as a conflict with no names', () => {
    expect(readDeleteFailure({ response: { status: 409, data: {} } })).toEqual({ conflict: true, names: [] });
  });

  it('does not call any other failure a conflict', () => {
    expect(readDeleteFailure({ response: { status: 500, data: { data: { projects: ['p1'] } } } }).conflict).toBe(false);
    expect(readDeleteFailure(new Error('network'))).toEqual({ conflict: false, names: [] });
    expect(readDeleteFailure(undefined)).toEqual({ conflict: false, names: [] });
  });
});

describe('summarizeBulkDelete', () => {
  it('counts successes and lists each failure with its reason', () => {
    const outcomes = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b', error: 'in use' },
      { id: '3', name: 'c' },
    ];
    expect(summarizeBulkDelete(outcomes)).toEqual({
      succeeded: 2,
      failures: [{ id: '2', name: 'b', error: 'in use' }],
    });
  });

  it('is empty before anything finished', () => {
    expect(summarizeBulkDelete([])).toEqual({ succeeded: 0, failures: [] });
  });
});

describe('toDeleteConfirm', () => {
  it('names the connection in the title', () => {
    const { config, name } = toDeleteConfirm({ kind: DELETE_KIND.CONNECTION, name: 'gh-main' });
    expect(config.tone).toBe(CONFIRM_TONE.DANGER);
    expect(config.title(name)).toBe(DETAIL_COPY.confirm.connection.title('gh-main'));
  });

  it('names the scope for a clear and for a delete', () => {
    for (const kind of [DELETE_KIND.SCOPE_CLEAR, DELETE_KIND.SCOPE_DELETE] as const) {
      const { config, name } = toDeleteConfirm({ kind, scope: scope(4) });
      expect(config.title(name)).toBe(DETAIL_COPY.confirm[kind].title('scope-4'));
    }
  });

  it('counts the bulk selection and lists the first names only', () => {
    const scopes = Array.from({ length: MAX_LISTED_SCOPES + 2 }, (_, index) => scope(index));
    const { config } = toDeleteConfirm({ kind: DELETE_KIND.SCOPES_BULK, scopes });
    expect(config.title('')).toBe(DETAIL_COPY.confirm.scopesBulk.title(scopes.length));
    expect(config.description('')).toContain('scope-0');
    expect(config.description('')).not.toContain(`scope-${MAX_LISTED_SCOPES}`);
    expect(config.description('')).toContain('and 2 more');
  });
});
