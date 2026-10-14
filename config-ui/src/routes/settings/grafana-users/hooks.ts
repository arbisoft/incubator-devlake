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
import type { GrafanaRole, GrafanaUser } from '@/api/grafana-users/types';
import { useConfirmFlow } from '@/ui/hooks';
import { operator } from '@/utils';

import { COPY, GRAFANA_FLOW_ERRORS, GRAFANA_ROW_ACTION } from './constants';
import type { GrafanaDialog, GrafanaRowAction } from './types';
import { getFlowError } from './utils';

type Pending = { action: GrafanaRowAction; user: GrafanaUser };

const resolve = ({ action, user }: Pending) => ({ config: COPY.confirm[action], name: user.email });

const toRequest =
  ({ action, user }: Pending) =>
  async (): Promise<void> => {
    if (action === GRAFANA_ROW_ACTION.DELETE) return API.grafanaUsers.deleteUser(user.id);
    await API.grafanaUsers.updateUser(user.id, { disabled: action === GRAFANA_ROW_ACTION.DISABLE });
  };

export const useGrafanaRowActions = (onDone: () => void) => {
  const run = useCallback(
    async (pending: Pending, setLoading: (loading: boolean) => void) => {
      const errors =
        pending.action === GRAFANA_ROW_ACTION.DELETE ? GRAFANA_FLOW_ERRORS.DELETE : GRAFANA_FLOW_ERRORS.STATUS;
      const [success] = await operator(toRequest(pending), {
        setOperating: setLoading,
        formatReason: getFlowError(errors),
      });
      onDone();
      return success;
    },
    [onDone],
  );
  const { request, confirmProps } = useConfirmFlow({ resolve, run });

  const requestAction = useCallback(
    (action: GrafanaRowAction, user: GrafanaUser) => request({ action, user }),
    [request],
  );

  const changeRole = useCallback(
    async (user: GrafanaUser, role: GrafanaRole) => {
      await operator(() => API.grafanaUsers.updateUser(user.id, { role }), {
        formatReason: getFlowError(GRAFANA_FLOW_ERRORS.ROLE),
      });
      onDone();
    },
    [onDone],
  );

  return { requestAction, changeRole, confirmProps };
};

type DialogState = { kind?: GrafanaDialog; user?: GrafanaUser; session: number };

export const useDialogState = () => {
  const [state, setState] = useState<DialogState>({ session: 0 });
  const open = useCallback(
    (kind: GrafanaDialog, user?: GrafanaUser) => setState((current) => ({ kind, user, session: current.session + 1 })),
    [],
  );
  const close = useCallback(() => setState((current) => ({ ...current, kind: undefined })), []);
  return { ...state, open, close };
};
