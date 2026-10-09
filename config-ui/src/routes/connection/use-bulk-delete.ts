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

import { useCallback, useState } from 'react';

import API from '@/api';
import { useConcurrencyQueue } from '@/ui/hooks';
import { toUserMessage } from '@/ui/utils';

import { BULK_DELETE_CONCURRENCY, DELETE_ERROR_MAP, DETAIL_COPY } from './constants';
import type { ScopeRow } from './scope-table';
import type { BulkDeleteState, BulkOutcome } from './types';

type Options = { plugin: string; connectionId: ID; onFinished: () => void };

const CLOSED: BulkDeleteState = { open: false, running: false, total: 0, completed: 0, outcomes: [] };

export const useBulkDelete = ({ plugin, connectionId, onFinished }: Options) => {
  const [state, setState] = useState<BulkDeleteState>(CLOSED);
  const { enqueue } = useConcurrencyQueue(BULK_DELETE_CONCURRENCY);

  const start = useCallback(
    async (scopes: ScopeRow[]) => {
      const outcomes: BulkOutcome[] = [];
      setState({ open: true, running: true, total: scopes.length, completed: 0, outcomes: [] });

      await Promise.all(
        scopes.map(({ id, name }) =>
          enqueue(String(id), async () => {
            try {
              await API.scope.remove(plugin, connectionId, id, false);
              outcomes.push({ id, name });
            } catch (error) {
              outcomes.push({ id, name, error: toUserMessage(error, DELETE_ERROR_MAP, DETAIL_COPY.errors.failed) });
            } finally {
              setState((current) => ({ ...current, completed: current.completed + 1 }));
            }
          }),
        ),
      );

      setState((current) => ({ ...current, running: false, outcomes: [...outcomes] }));
      onFinished();
    },
    [plugin, connectionId, enqueue, onFinished],
  );

  const close = useCallback(() => setState((current) => (current.running ? current : { ...current, open: false })), []);
  const reset = useCallback(() => setState(CLOSED), []);

  return { state, start, close, reset };
};
