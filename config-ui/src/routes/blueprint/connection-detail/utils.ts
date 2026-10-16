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

import { BLUEPRINT_VIEW, PATHS, PROJECT_TAB } from '@/config';
import type { BlueprintConnectionPayload } from '@/types/blueprint';
import type { Crumb } from '@/ui/types';

import { COPY as BLUEPRINT_COPY } from '../constants';

import { COPY } from './constants';
import type { ConnectionRef, DetailRoutes, DetailScope } from './types';

const UNIQUE_SEPARATOR = '-';

export const parseUnique = (unique: string): ConnectionRef => {
  const split = unique.lastIndexOf(UNIQUE_SEPARATOR);
  return { plugin: unique.slice(0, split), connectionId: Number(unique.slice(split + 1)) };
};

const isConnection = (
  { plugin, connectionId }: ConnectionRef,
  { pluginName, connectionId: id }: BlueprintConnectionPayload,
) => pluginName === plugin && id === connectionId;

export const getScopeIds = (connections: BlueprintConnectionPayload[], ref: ConnectionRef): ID[] =>
  connections.find((connection) => isConnection(ref, connection))?.scopes?.map(({ scopeId }) => scopeId) ?? [];

export const replaceScopes = (connections: BlueprintConnectionPayload[], ref: ConnectionRef, scopeIds: ID[]) =>
  connections.map((connection) =>
    isConnection(ref, connection) ? { ...connection, scopes: scopeIds.map((scopeId) => ({ scopeId })) } : connection,
  );

export const withoutConnection = (connections: BlueprintConnectionPayload[], ref: ConnectionRef) =>
  connections.filter((connection) => !isConnection(ref, connection));

// Back navigation always names the Configurations view by its URL.
export const getDetailRoutes = (
  { pname, blueprintId }: DetailScope,
  { plugin, connectionId }: ConnectionRef,
): DetailRoutes => ({
  status: pname ? PATHS.PROJECT_TAB(pname, PROJECT_TAB.BLUEPRINT) : PATHS.BLUEPRINT(blueprintId),
  configuration: pname
    ? PATHS.PROJECT_BLUEPRINT_VIEW(pname, BLUEPRINT_VIEW.CONFIGURATION)
    : PATHS.BLUEPRINT_VIEW(blueprintId, BLUEPRINT_VIEW.CONFIGURATION),
  connection: PATHS.CONNECTION(plugin, connectionId),
});

export const getBreadcrumbs = ({ pname, blueprintId }: DetailScope, routes: DetailRoutes): Crumb[] => [
  ...(pname
    ? [
        { label: COPY.breadcrumbs.projects, path: PATHS.PROJECTS() },
        { label: pname, path: PATHS.PROJECT(pname) },
        { label: COPY.breadcrumbs.blueprint, path: routes.status },
      ]
    : [
        { label: BLUEPRINT_COPY.breadcrumbAdvanced, path: PATHS.BLUEPRINTS() },
        { label: BLUEPRINT_COPY.breadcrumbBlueprints, path: PATHS.BLUEPRINTS() },
        { label: String(blueprintId), path: routes.status },
      ]),
  { label: COPY.breadcrumbs.configurations, path: routes.configuration },
  { label: COPY.breadcrumbs.editScope },
];

export const getTargetLabel = (pname: string | undefined, blueprintName: string) =>
  pname ? COPY.target.project(pname) : COPY.target.advanced(blueprintName);

export const sliceRows = <T>(rows: T[], page: number, pageSize: number) =>
  rows.slice((page - 1) * pageSize, page * pageSize);
