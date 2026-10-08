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
import { isEqualWith } from 'lodash';
import { useEffect, useRef, useState } from 'react';

import { REFRESH_DATA_STATE, REQUEST_DELAY_MS } from './constants';
import type { RefreshDataRequestState } from './types';

export const useRefreshData = <T>(request: (signal: AbortSignal) => Promise<T>, deps: React.DependencyList = []) => {
  const [, setVersion] = useState(0);
  const generation = useRef(0);
  const ref = useRef<RefreshDataRequestState<T>>({ state: REFRESH_DATA_STATE.PENDING });

  useEffect(() => {
    if (isEqualWith(ref.current.deps, deps)) return;

    ref.current.state = REFRESH_DATA_STATE.PENDING;
    ref.current.deps = deps;
    ref.current.data = undefined;
    ref.current.error = undefined;
    window.clearTimeout(ref.current.timer);
    ref.current.abortController?.abort();

    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    ref.current.abortController = controller;
    ref.current.timer = window.setTimeout(() => {
      request(controller.signal)
        .then((data: T) => {
          if (controller.signal.aborted || generation.current !== currentGeneration) return;
          ref.current.data = data;
          ref.current.state = REFRESH_DATA_STATE.READY;
          ref.current.error = undefined;
          setVersion((version) => version + 1);
        })
        .catch((error: unknown) => {
          if (axios.isCancel(error) || controller.signal.aborted || generation.current !== currentGeneration) return;
          ref.current.state = REFRESH_DATA_STATE.ERROR;
          ref.current.error = error;
          setVersion((version) => version + 1);
        });
    }, REQUEST_DELAY_MS);
  });

  useEffect(
    () => () => {
      generation.current += 1;
      ref.current.deps = undefined;
      window.clearTimeout(ref.current.timer);
      ref.current.abortController?.abort();
    },
    [],
  );

  if (!isEqualWith(ref.current.deps, deps)) {
    return { data: undefined, ready: false, pending: true, error: undefined };
  }

  return {
    data: ref.current.data,
    ready: ref.current.state === REFRESH_DATA_STATE.READY,
    pending: ref.current.state === REFRESH_DATA_STATE.PENDING,
    error: ref.current.error,
  };
};
