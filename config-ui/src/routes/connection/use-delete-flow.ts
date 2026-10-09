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
import { useCallback, useState } from 'react';

import API from '@/api';
import { removeConnection } from '@/features/connections';
import { useAppDispatch } from '@/hooks';
import { useConfirmFlow } from '@/ui/hooks';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { CONFLICT_KIND, DELETE_ERROR_MAP, DELETE_KIND, DETAIL_COPY } from './constants';
import { readDeleteFailure, toDeleteConfirm } from './delete-utils';
import type { ScopeRow } from './scope-table';
import type { ConflictKind, ConflictState, DeletePending } from './types';

type Options = {
  plugin: string;
  connectionId: ID;
  onConnectionDeleted: () => void;
  onScopeRemoved: () => void;
  onBulkConfirmed: (scopes: ScopeRow[]) => void;
};

export const useDeleteFlow = ({
  plugin,
  connectionId,
  onConnectionDeleted,
  onScopeRemoved,
  onBulkConfirmed,
}: Options) => {
  const dispatch = useAppDispatch();
  const [conflict, setConflict] = useState<ConflictState>();
  const [conflictOpen, setConflictOpen] = useState(false);

  const reportSuccess = useCallback(
    (pending: DeletePending) => {
      if (pending.kind === DELETE_KIND.CONNECTION) {
        message.success(DETAIL_COPY.toast.connectionDeleted);
        onConnectionDeleted();
        return;
      }
      const cleared = pending.kind === DELETE_KIND.SCOPE_CLEAR;
      message.success(cleared ? DETAIL_COPY.toast.scopeCleared : DETAIL_COPY.toast.scopeDeleted);
      onScopeRemoved();
    },
    [onConnectionDeleted, onScopeRemoved],
  );

  // A conflict closes the confirmation in favour of the conflict list; any other failure leaves it open to retry.
  const reportFailure = useCallback((error: unknown, kind: ConflictKind) => {
    const failure = readDeleteFailure(error);
    if (!failure.conflict) {
      message.error(toUserMessage(error, DELETE_ERROR_MAP, DETAIL_COPY.errors.failed));
      return false;
    }
    setConflict({ kind, names: failure.names });
    setConflictOpen(true);
    return true;
  }, []);

  const run = useCallback(
    async (pending: DeletePending, setLoading: (loading: boolean) => void) => {
      if (pending.kind === DELETE_KIND.SCOPES_BULK) {
        onBulkConfirmed(pending.scopes);
        return true;
      }
      const request =
        pending.kind === DELETE_KIND.CONNECTION
          ? () => dispatch(removeConnection({ plugin, connectionId })).unwrap()
          : () => API.scope.remove(plugin, connectionId, pending.scope.id, pending.kind === DELETE_KIND.SCOPE_CLEAR);

      const [success, error] = await operator(request, { setOperating: setLoading, hideToast: true });
      if (!success) {
        return reportFailure(
          error,
          pending.kind === DELETE_KIND.CONNECTION ? CONFLICT_KIND.CONNECTION : CONFLICT_KIND.SCOPE,
        );
      }
      reportSuccess(pending);
      return true;
    },
    [plugin, connectionId, dispatch, onBulkConfirmed, reportSuccess, reportFailure],
  );

  const { request, confirmProps } = useConfirmFlow<DeletePending>({ resolve: toDeleteConfirm, run });

  return { request, confirmProps, conflict, conflictOpen, closeConflict: () => setConflictOpen(false) };
};
