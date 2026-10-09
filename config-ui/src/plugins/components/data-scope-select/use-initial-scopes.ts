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
import axios from 'axios';
import { useEffect, useEffectEvent } from 'react';

import API from '@/api';
import { getPluginScopeId } from '@/plugins/utils';
import { toUserMessage } from '@/ui/utils';

import { COPY, INITIAL_LABEL_LOOKUP_LIMIT } from './constants';
import type { InitialScope, MergeItems } from './types';
import { toDataScopeItem } from './utils';

type Options = {
  plugin: string;
  connectionId: ID;
  initialScope: InitialScope[] | undefined;
  mergeItems: MergeItems;
  setSelectedIds: (ids: ID[]) => void;
};

// Seeds the selection from the given scopes and looks up the labels of those the list hasn't loaded.
export const useInitialScopes = ({ plugin, connectionId, initialScope, mergeItems, setSelectedIds }: Options) => {
  const initialScopeKey = (initialScope ?? []).map((sc) => sc.id).join(',');

  const seed = useEffectEvent(async (signal: AbortSignal) => {
    const initialScopeIds = (initialScope ?? []).map((sc) => sc.id);
    setSelectedIds(initialScopeIds);

    const withData = (initialScope ?? []).flatMap((sc) => (sc.scope ? [{ scope: sc.scope }] : []));
    if (withData.length) {
      mergeItems(withData.map((sc) => toDataScopeItem(plugin, sc)));
    }

    const loadedIds = withData.map((sc) => `${getPluginScopeId(plugin, sc.scope)}`);
    const idsToLoad = initialScopeIds
      .filter((scopeId) => !loadedIds.includes(`${scopeId}`))
      .slice(0, INITIAL_LABEL_LOOKUP_LIMIT);

    if (!idsToLoad.length) return;

    const results = await Promise.allSettled(
      idsToLoad.map((scopeId) => API.scope.get(plugin, connectionId, scopeId, undefined, signal)),
    );
    if (signal.aborted) return;

    const loadedItems = results
      .filter(
        (result): result is PromiseFulfilledResult<{ scope: NonNullable<InitialScope['scope']> }> =>
          result.status === 'fulfilled',
      )
      .map((result) => toDataScopeItem(plugin, result.value));

    if (loadedItems.length) {
      mergeItems(loadedItems);
    }

    const failure = results.find((result) => result.status === 'rejected' && !axios.isCancel(result.reason));
    if (failure && failure.status === 'rejected') {
      message.error(toUserMessage(failure.reason, {}, COPY.error.initial));
    }

    if (initialScopeIds.length > INITIAL_LABEL_LOOKUP_LIMIT) {
      message.warning(COPY.initialLabelsLimited);
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    seed(controller.signal);
    return () => controller.abort();
  }, [connectionId, initialScopeKey, plugin]);
};
