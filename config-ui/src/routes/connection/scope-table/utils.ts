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

import { getPluginScopeId, getPluginScopeName } from '@/plugins/utils';

import type { ScopeListItem, ScopeRow } from './types';

export const toScopeRows = (plugin: string, items: ScopeListItem[] | undefined): ScopeRow[] =>
  (items ?? []).map(({ scope, scopeConfig, blueprints }) => ({
    id: getPluginScopeId(plugin, scope),
    name: getPluginScopeName(plugin, scope) || scope.fullName || scope.name,
    projects: blueprints?.map((blueprint) => blueprint.projectName) ?? [],
    configId: scopeConfig?.id,
    configName: scopeConfig?.name,
  }));

// Keeps the ids still on screen, and returns the same array when none was dropped.
export const pruneSelection = (selected: ID[], rows: ScopeRow[]): ID[] => {
  const present = new Set(rows.map((row) => row.id));
  const kept = selected.filter((id) => present.has(id));
  return kept.length === selected.length ? selected : kept;
};

export const selectedScopes = (ids: ID[], rows: ScopeRow[]): ScopeRow[] =>
  ids.flatMap((id) => rows.find((row) => row.id === id) ?? []);
