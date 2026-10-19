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

import API from '@/api';
import type { OtelRebindResponse } from '@/api/otel';

import type { PendingRebind } from '../types';
import { getOtelRebindError, getReplayQueuedMessage } from '../utils';

import { COPY } from './constants';
import { useConfirmedMutation } from './use-confirmed-mutation';

const resolve = ({ connection }: PendingRebind) => ({
  config: COPY.rebind.confirm,
  name: connection.connection.teamName,
});

const request = ({ connection, payload }: PendingRebind) => API.otel.rebind(connection.connection.id, payload);

const formatSuccess = ({ connection }: PendingRebind, { replays }: OtelRebindResponse) =>
  [COPY.rebind.done(connection.connection.teamName), replays && getReplayQueuedMessage(replays)]
    .filter(Boolean)
    .join(' ');

export const useRebindConfirm = ({ onRebound }: { onRebound: () => void }) =>
  useConfirmedMutation({ resolve, request, formatError: getOtelRebindError, formatSuccess, onSuccess: onRebound });
