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

import { message } from 'antd';
import { useCallback } from 'react';

import API from '@/api';
import type { OtelConnectionResponse } from '@/api/otel';
import { useConfirmFlow } from '@/ui/hooks';
import { operator } from '@/utils';

import { COPY, LIFECYCLE_ACTION } from './constants';
import type { LifecycleAction, PendingOtelAction, OtelActionCallbacks } from './types';
import { getOtelApplyError, getOtelLifecycleError, notifyOtelAttentionChanged } from './utils';

const REQUESTS: Record<LifecycleAction, (id: ID) => Promise<OtelConnectionResponse>> = {
  [LIFECYCLE_ACTION.ROTATE]: (id) => API.otel.rotate(id),
  [LIFECYCLE_ACTION.REVOKE]: (id) => API.otel.revoke(id),
  [LIFECYCLE_ACTION.HIDE]: (id) => API.otel.hide(id),
  [LIFECYCLE_ACTION.FINALIZE]: (id) => API.otel.finalizeRotation(id),
  [LIFECYCLE_ACTION.APPLY]: (id) => API.otel.apply(id),
};

const resolve = ({ action, connection }: PendingOtelAction) => ({
  config: COPY.confirm[action],
  name: connection.connection.teamName,
});

export const useOtelAction = ({ onDone, onCredential }: OtelActionCallbacks) => {
  const run = useCallback(
    async ({ action, connection }: PendingOtelAction, setLoading: (loading: boolean) => void) => {
      const { id, teamName } = connection.connection;
      const [success, result] = await operator(() => REQUESTS[action](id), {
        setOperating: setLoading,
        hideToast: true,
      });
      if (!success) {
        message.error(getOtelLifecycleError(result));
        return false;
      }

      const response: OtelConnectionResponse = result;
      onDone();
      notifyOtelAttentionChanged();
      if (action === LIFECYCLE_ACTION.APPLY && response.restartRequired) {
        message.error(getOtelApplyError(response));
        return false;
      }
      message.success(COPY.done[action](teamName));
      if (response.managedSettings) onCredential(response);
      return true;
    },
    [onCredential, onDone],
  );

  const { request, confirmProps } = useConfirmFlow({ resolve, run });

  const start = useCallback(
    (action: LifecycleAction, connection: OtelConnectionResponse) => request({ action, connection }),
    [request],
  );

  return { start, confirmProps };
};
