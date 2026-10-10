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

import { WEBHOOK_PLUGIN } from '@/features/connections/constants';
import type { IConnection } from '@/types';
import type { BlueprintConnectionPayload } from '@/types/blueprint';

import { validRawPlan } from '../../utils';

import { COPY, EMPTY_PLAN, NEW_CONNECTION_VALUE, PLAN_INDENT } from './constants';
import type { ConnectionCardData, ConnectionOption } from './types';

export const toConnectionKey = (plugin: string, connectionId: ID) => `${plugin}-${connectionId}`;

export const toConnectionCards = (connections: BlueprintConnectionPayload[]): ConnectionCardData[] =>
  connections
    .filter(({ pluginName }) => pluginName !== WEBHOOK_PLUGIN)
    .map(({ pluginName, connectionId, scopes }) => ({
      key: toConnectionKey(pluginName, connectionId),
      plugin: pluginName,
      connectionId,
      scopeCount: scopes?.length ?? 0,
    }));

export const buildConnectionOptions = (connections: IConnection[], disabled: string[]): ConnectionOption[] => [
  { value: NEW_CONNECTION_VALUE, label: COPY.addConnection.createNew, plugin: '' },
  ...connections
    .filter(({ unique }) => !disabled.includes(unique))
    .map(({ unique, name, plugin }) => ({ value: unique, label: name, plugin })),
];

export const stringifyPlan = (plan: unknown) => JSON.stringify(plan, null, PLAN_INDENT);

// An unparsable or empty plan is saved as the empty plan, serialised.
export const toPlanPayload = (rawPlan: string) =>
  !validRawPlan(rawPlan) ? JSON.parse(rawPlan) : stringifyPlan(EMPTY_PLAN);

export const toScopeConnection = ({ plugin, id }: IConnection, scopeIds: ID[]): BlueprintConnectionPayload => ({
  pluginName: plugin,
  connectionId: id,
  scopes: scopeIds.map((scopeId) => ({ scopeId })),
});
