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

import axios from 'axios';

import API from '@/api';
import { getPluginScopeId } from '@/plugins/utils';

import { DETAIL_COPY, SCOPE_MEMBERSHIP_PAGE_SIZE } from '../constants';

export const loadScopeMembership = async (plugin: string, connectionId: ID, signal: AbortSignal) => {
  const scopes: Array<{ id: ID }> = [];
  let count: number | undefined;
  let page = 1;

  while (count === undefined || scopes.length < count) {
    if (signal.aborted) throw new axios.CanceledError();

    const response = await API.scope.list(plugin, connectionId, { page, pageSize: SCOPE_MEMBERSHIP_PAGE_SIZE }, signal);

    if (signal.aborted) throw new axios.CanceledError();
    const { count: pageCount, scopes: pageScopes } = response;
    if (count === undefined) count = pageCount;
    if (pageScopes.length === 0 && scopes.length < count) throw new Error(DETAIL_COPY.membershipLoadFailed);

    scopes.push(...pageScopes.map(({ scope }) => ({ id: getPluginScopeId(plugin, scope) })));
    page += 1;
  }

  const seen = new Set<string>();
  return scopes.filter(({ id }) => {
    const normalizedId = String(id);
    if (seen.has(normalizedId)) return false;
    seen.add(normalizedId);
    return true;
  });
};
