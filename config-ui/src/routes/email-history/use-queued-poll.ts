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

import { useEffect } from 'react';

import API from '@/api';
import type { HistoryParams } from '@/api/mail';

import { QUEUED_POLL_MS } from './constants';
import type { EmailHistoryItem } from './types';
import { hasQueued, queuedChanged } from './utils';

// useQueuedPoll checks the shown page in the background while it has a queued email, and calls
// onChange once a queued row moves on. Checking quietly keeps the table from flashing every tick.
export const useQueuedPoll = (
  page: { items: EmailHistoryItem[]; count: number } | undefined,
  query: HistoryParams,
  onChange: () => void,
) => {
  useEffect(() => {
    if (!page || !hasQueued(page.items)) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      API.mail
        .history(query, controller.signal)
        .then((fresh) => {
          if (!controller.signal.aborted && queuedChanged(page, fresh)) onChange();
        })
        .catch(() => undefined); // a failed check waits for the next tick
    }, QUEUED_POLL_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [page, query, onChange]);
};
