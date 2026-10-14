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

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { toScopeRows, type ScopeListItem } from '@/routes/connection/scope-table';
import type { IBlueprint } from '@/types';
import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';
import { useConfirmFlow, useLastLoaded, useListState, useRefreshVersion } from '@/ui/hooks';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { COPY as DETAIL_COPY } from '../detail/constants';
import { useBlueprintActions } from '../detail/hooks';

import { COPY, FOLLOW_UP } from './constants';
import type { ConnectionDetailData, ConnectionRef, DetailRoutes, FollowUpKind } from './types';
import { getTargetLabel, parseUnique, replaceScopes, sliceRows, withoutConnection } from './utils';

const loadBlueprint = async (pname: string | undefined, bid: string | undefined, signal: AbortSignal) => {
  if (pname) return (await API.project.get(pname, signal)).blueprint as IBlueprint | undefined;
  return (await API.blueprint.get(bid ?? '', signal)) as IBlueprint;
};

export const useConnectionDetail = () => {
  const { pname, bid, unique = '' } = useParams();
  const { version, refresh } = useRefreshVersion();
  const ref = useMemo(() => parseUnique(unique), [unique]);

  const { data, ready, error } = useRefreshData(
    async (signal): Promise<ConnectionDetailData | undefined> => {
      const [blueprint, connection] = await Promise.all([
        loadBlueprint(pname, bid, signal),
        API.connection.get(ref.plugin, ref.connectionId, signal),
      ]);
      return blueprint && { blueprint, connectionName: connection.name };
    },
    [version, pname, bid, unique],
  );
  const loaded = useLastLoaded(data, `${pname}/${bid}/${unique}`);

  return { pname, ref, data: loaded, failed: error !== undefined, ready, refresh };
};

export const useScopeRows = (ref: ConnectionRef, scopeIds: ID[]) => {
  const list = useListState<string, Record<string, never>>({ filters: {} });
  const { version, refresh } = useRefreshVersion();
  const { plugin, connectionId } = ref;

  const { data, ready, error } = useRefreshData(
    async (signal) => {
      const scopes = await Promise.all(
        scopeIds.map((scopeId) => API.scope.get(plugin, connectionId, scopeId, undefined, signal)),
      );
      return toScopeRows(plugin, scopes as ScopeListItem[]);
    },
    [plugin, connectionId, scopeIds, version],
  );
  const loaded = useLastLoaded(data, `${plugin}-${connectionId}`);
  const rows = useMemo(() => loaded ?? [], [loaded]);
  const pageRows = useMemo(() => sliceRows(rows, list.page, list.pageSize), [rows, list.page, list.pageSize]);

  return { list, rows: pageRows, total: rows.length, ready, failed: error !== undefined, refresh };
};

type ActionsOptions = {
  blueprint: IBlueprint;
  pname?: string;
  ref: ConnectionRef;
  connectionName: string;
  routes: DetailRoutes;
  onChanged: () => void;
};

type FollowUpState = { open: boolean; kind: FollowUpKind };

export const useConnectionActions = ({ blueprint, pname, ref, connectionName, routes, onChanged }: ActionsOptions) => {
  const navigate = useNavigate();
  const [manageOpen, setManageOpen] = useState(false);
  const [followUp, setFollowUp] = useState<FollowUpState>({ open: false, kind: FOLLOW_UP.SCOPES });
  const [running, setRunning] = useState(false);
  const { trigger } = useBlueprintActions({ blueprint, onRefresh: onChanged });
  const target = getTargetLabel(pname, blueprint.name);

  const saveConnections = (connections: IBlueprint['connections'], setLoading?: (loading: boolean) => void) =>
    operator(() => API.blueprint.update(blueprint.id, { ...blueprint, connections }), {
      setOperating: setLoading,
      formatMessage: () => DETAIL_COPY.messages.updated,
      formatReason: (error) => toUserMessage(error, {}, COPY.errors.update),
    });

  const changeScopes = async (scopeIds: ID[]) => {
    const [success] = await saveConnections(replaceScopes(blueprint.connections, ref, scopeIds));
    if (!success) return;
    setManageOpen(false);
    setFollowUp({ open: true, kind: FOLLOW_UP.SCOPES });
  };

  const resolveRemove = useCallback(
    () => ({
      name: connectionName,
      config: {
        tone: CONFIRM_TONE.DANGER,
        title: COPY.remove.title,
        description: (name: string) => COPY.remove.description(name, target),
        confirm: COPY.remove.confirm,
      },
    }),
    [connectionName, target],
  );
  const removeConnection = useCallback(
    async (_: null, setLoading: (loading: boolean) => void) => {
      const [success] = await operator(
        () =>
          API.blueprint.update(blueprint.id, {
            ...blueprint,
            connections: withoutConnection(blueprint.connections, ref),
          }),
        {
          setOperating: setLoading,
          formatMessage: () => COPY.messages.removed,
          formatReason: (error) => toUserMessage(error, {}, COPY.errors.remove),
        },
      );
      if (success) setFollowUp({ open: true, kind: FOLLOW_UP.REMOVAL });
      return success;
    },
    [blueprint, ref],
  );
  const remove = useConfirmFlow<null>({ resolve: resolveRemove, run: removeConnection });

  const recollect = async () => {
    if (await trigger(undefined, setRunning)) {
      setFollowUp((current) => ({ ...current, open: false }));
      navigate(routes.status);
    }
  };

  const postpone = () => {
    setFollowUp((current) => ({ ...current, open: false }));
    if (followUp.kind === FOLLOW_UP.REMOVAL) navigate(routes.configuration);
    else onChanged();
  };

  return {
    manageOpen,
    openManage: () => setManageOpen(true),
    closeManage: () => setManageOpen(false),
    changeScopes,
    requestRemove: () => remove.request(null),
    removeProps: remove.confirmProps,
    followUp,
    running,
    recollect,
    postpone,
  };
};
