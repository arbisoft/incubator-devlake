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

import {
  CONNECTION_COPY as COPY,
  CONNECTION_HTTP_STATUS as HTTP_STATUS,
  HEALTH_FAILURE_REASON,
  selectHealth,
  testConnection,
  toConnectionActionErrorMessage,
  toHealthView,
} from '@/features/connections';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { IConnectionStatus } from '@/types';
import { ConnectionHealth } from '@/ui';
import { operator } from '@/utils';

import type { ConnectionStatusProps } from './types';

export const ConnectionStatus = ({ connection }: ConnectionStatusProps) => {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((state) => selectHealth(state)[connection.unique]);

  const retest = () =>
    operator(
      async () => {
        const result = await dispatch(testConnection(connection)).unwrap();
        if (result.status === IConnectionStatus.OFFLINE) {
          let status: number = HTTP_STATUS.BAD_REQUEST;
          if (result.health.reason === HEALTH_FAILURE_REASON.CREDENTIALS) status = HTTP_STATUS.UNAUTHORIZED;
          else if (result.health.reason === HEALTH_FAILURE_REASON.UNREACHABLE) {
            status = HTTP_STATUS.SERVICE_UNAVAILABLE;
          }
          throw Object.assign(new Error(COPY.testFailed.fallback), {
            response: { status, data: { message: result.health.message } },
          });
        }
        return result;
      },
      { formatReason: toConnectionActionErrorMessage },
    );

  return (
    <ConnectionHealth
      {...toHealthView(entry)}
      testing={connection.status === IConnectionStatus.TESTING}
      onRetest={retest}
    />
  );
};
