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

import { useCallback, useRef, useState } from 'react';

import API from '@/api';
import type { IConnection } from '@/types';
import { useConcurrencyQueue } from '@/ui';

import { REPO_COUNT_CONCURRENCY, REPO_COUNT_QUERY } from './constants';
import type { RepoCounts } from './types';
import { toRepoCount } from './utils';

// A failed count is stored as null and shown as a dash; it never raises a toast.
export const useRepoCounts = () => {
  const [counts, setCounts] = useState<RepoCounts>({});
  const requested = useRef(new Set<string>());
  const { enqueue } = useConcurrencyQueue(REPO_COUNT_CONCURRENCY);

  const load = useCallback(
    ({ unique, plugin, id }: IConnection) => {
      if (requested.current.has(unique)) return;
      requested.current.add(unique);
      void enqueue(unique, async () => {
        const count = await API.scope.list(plugin, id, REPO_COUNT_QUERY).then(toRepoCount, () => null);
        setCounts((current) => ({ ...current, [unique]: count }));
      });
    },
    [enqueue],
  );

  return { counts, load };
};
