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
import { useCallback } from 'react';
import { useStore } from 'react-redux';

import type { RootState } from '@/app/store';
import { useAppDispatch } from '@/hooks';
import type { IConnection } from '@/types';
import { useConcurrencyQueue } from '@/ui/hooks';

import { HEALTH_CONCURRENCY } from './constants';
import { findStaleConnections, isHealthFresh } from './health';
import { checkConnectionHealth } from './slice';

// Connections being tested by any check on the page, so two lists never test the same one at once.
const testing = new Set<string>();

export const useHealthChecks = () => {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { enqueue } = useConcurrencyQueue(HEALTH_CONCURRENCY);

  const check = useCallback(
    (connections: IConnection[]) => {
      const healthNow = () => store.getState().connections.health;
      for (const connection of findStaleConnections(connections, healthNow(), Date.now())) {
        void enqueue(connection.unique, async () => {
          if (testing.has(connection.unique) || isHealthFresh(healthNow()[connection.unique], Date.now())) return;
          testing.add(connection.unique);
          try {
            await dispatch(checkConnectionHealth(connection));
          } finally {
            testing.delete(connection.unique);
          }
        });
      }
    },
    [dispatch, enqueue, store],
  );

  return { check };
};
