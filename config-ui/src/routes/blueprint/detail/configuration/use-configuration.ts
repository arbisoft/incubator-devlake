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
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config/paths';
import { selectAllConnections } from '@/features/connections';
import { useAppSelector } from '@/hooks';
import type { IBlueprint } from '@/types';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { COPY as DETAIL_COPY } from '../constants';
import { useBlueprintActions } from '../hooks';

import { ADD_CONNECTION_STEP, CONFIG_MODAL, NEW_CONNECTION_VALUE } from './constants';
import type { AddConnectionState, ConfigModal, ConfigurationProps } from './types';
import { buildConnectionOptions, stringifyPlan, toConnectionCards, toPlanPayload, toScopeConnection } from './utils';

const CLOSED: AddConnectionState = { step: ADD_CONNECTION_STEP.CLOSED };

const useAddConnection = (disabled: string[]) => {
  const navigate = useNavigate();
  const connections = useAppSelector(selectAllConnections);
  const [state, setState] = useState<AddConnectionState>(CLOSED);

  const options = useMemo(() => buildConnectionOptions(connections, disabled), [connections, disabled]);
  const connection = useMemo(
    () => connections.find(({ unique }) => unique === state.selected),
    [connections, state.selected],
  );

  const select = useCallback(
    (value: string) => {
      if (value === NEW_CONNECTION_VALUE) navigate(PATHS.CONNECTIONS());
      else setState({ step: ADD_CONNECTION_STEP.SELECT, selected: value });
    },
    [navigate],
  );

  return {
    step: state.step,
    selected: state.selected,
    options,
    connection,
    start: () => setState({ step: ADD_CONNECTION_STEP.SELECT }),
    select,
    next: () => setState((current) => ({ ...current, step: ADD_CONNECTION_STEP.SCOPES })),
    close: () => setState((current) => ({ ...current, step: ADD_CONNECTION_STEP.CLOSED })),
  };
};

export const useBlueprintConfiguration = ({
  blueprint,
  onRefresh,
  onShowStatus,
}: Omit<ConfigurationProps, 'connectionPath'>) => {
  const [modal, setModal] = useState<ConfigModal>();
  const [saving, setSaving] = useState(false);
  const [planEdit, setPlanEdit] = useState<{ base: string; text: string }>();
  const { operating: running, trigger } = useBlueprintActions({ blueprint, onRefresh });

  const cards = useMemo(() => toConnectionCards(blueprint.connections), [blueprint.connections]);
  const connectionKeys = useMemo(() => cards.map(({ key }) => key), [cards]);
  const addConnection = useAddConnection(connectionKeys);

  const savedPlan = useMemo(() => stringifyPlan(blueprint.plan), [blueprint.plan]);
  const rawPlan = planEdit?.base === savedPlan ? planEdit.text : savedPlan;

  const update = async (payload: Partial<IBlueprint>) => {
    const [success] = await operator(() => API.blueprint.update(blueprint.id, { ...blueprint, ...payload }), {
      setOperating: setSaving,
      formatMessage: () => DETAIL_COPY.messages.updated,
      formatReason: (error) => toUserMessage(error, {}, DETAIL_COPY.errors.update),
    });
    if (success) {
      onRefresh();
      setModal(undefined);
    }
    return success;
  };

  const collect = async () => {
    if (await trigger()) onShowStatus();
  };

  const addScopes = async (scopeIds: ID[]) => {
    if (!addConnection.connection) return;
    const connection = toScopeConnection(addConnection.connection, scopeIds);
    if (await update({ connections: [...blueprint.connections, connection] })) addConnection.close();
  };

  return {
    cards,
    saving,
    running,
    modal,
    openModal: setModal,
    closeModal: () => setModal(undefined),
    rawPlan,
    setRawPlan: (text: string) => setPlanEdit({ base: savedPlan, text }),
    saveName: (name: string) => update({ name }),
    savePolicy: (policy: Partial<IBlueprint>) => update(policy),
    savePlan: () => update({ plan: toPlanPayload(rawPlan) }),
    collect,
    addConnection: { ...addConnection, submit: addScopes },
    isNameOpen: modal === CONFIG_MODAL.NAME,
    isPolicyOpen: modal === CONFIG_MODAL.POLICY,
  };
};
