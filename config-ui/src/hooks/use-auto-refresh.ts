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

import axios from 'axios';
import { useState, useEffect, useMemo, useRef } from 'react';

type RetryOnError = { delay: number; limit: number };

export const useAutoRefresh = <T>(
  request: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList = [],
  option?: {
    cancel?: (data?: T) => boolean;
    interval?: number;
    retryLimit?: number;
    retryOnError?: RetryOnError;
  },
) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();

  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const retryTimer = useRef<number | undefined>(undefined);
  const retryCount = useRef<number>(0);

  useEffect(() => {
    const controller = new AbortController();
    let failures = 0;

    const run = () => {
      setLoading(true);
      request(controller.signal)
        .then((data: T) => {
          setData(data);
          setError(undefined);
          failures = 0;
        })
        .catch((err: unknown) => {
          if (axios.isCancel(err)) return;
          setError(err);
          if (option?.retryOnError && failures < option.retryOnError.limit) {
            failures += 1;
            retryTimer.current = window.setTimeout(run, option.retryOnError.delay);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    };

    run();
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer.current);
    };
  }, [...deps]);

  useEffect(() => {
    const controller = new AbortController();
    timer.current = setInterval(() => {
      setLoading(true);
      retryCount.current += 1;
      request(controller.signal)
        .then((data) => {
          setData(data);
          setError(undefined);
        })
        .catch((err: unknown) => {
          if (!axios.isCancel(err)) setError(err);
        })
        .finally(() => {
          setLoading(false);
        });
    }, option?.interval ?? 5000);
    return () => {
      controller.abort();
      clearInterval(timer.current);
    };
  }, [...deps]);

  useEffect(() => {
    if (option?.cancel?.(data) || (option?.retryLimit && option?.retryLimit <= retryCount.current)) {
      clearInterval(timer.current);
    }
  }, [data]);

  return useMemo(
    () => ({
      loading,
      data,
      error,
    }),
    [loading, data, error],
  );
};
