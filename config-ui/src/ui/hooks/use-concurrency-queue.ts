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

import { useCallback, useEffect, useRef } from 'react';

type Job = () => Promise<unknown>;

// Jobs run at most `limit` at a time; a key already queued or running returns its pending promise.
export const useConcurrencyQueue = (limit: number) => {
  const limitRef = useRef(limit);
  useEffect(() => {
    limitRef.current = limit;
  }, [limit]);
  const pending = useRef(new Map<string, Promise<void>>());
  const waiting = useRef<(() => void)[]>([]);
  const running = useRef(0);

  const pump = useCallback(() => {
    while (running.current < limitRef.current && waiting.current.length > 0) {
      running.current += 1;
      waiting.current.shift()?.();
    }
  }, []);

  const enqueue = useCallback(
    (key: string, job: Job): Promise<void> => {
      const existing = pending.current.get(key);
      if (existing) return existing;
      const promise = new Promise<void>((resolve) => {
        waiting.current.push(() => {
          void (async () => job())()
            .catch(() => undefined)
            .finally(() => {
              running.current -= 1;
              pending.current.delete(key);
              resolve();
              pump();
            });
        });
      });
      pending.current.set(key, promise);
      pump();
      return promise;
    },
    [pump],
  );

  return { enqueue };
};
