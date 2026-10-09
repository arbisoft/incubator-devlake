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
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { DETAIL_COPY, NO_SCOPE_CONFIG } from './constants';

type Options = {
  plugin: string;
  connectionId: ID;
  scopeIds: ID[];
  onDone: () => void;
};

export const useAssociateScopeConfig = ({ plugin, connectionId, scopeIds, onDone }: Options) =>
  useCallback(
    async (configId: ID) => {
      const cleared = configId === NO_SCOPE_CONFIG;
      const [success] = await operator(
        () =>
          Promise.all(
            scopeIds.map(async (scopeId) => {
              const scope = await API.scope.get(plugin, connectionId, scopeId);
              return API.scope.update(plugin, connectionId, scopeId, {
                ...scope,
                scopeConfigId: cleared ? null : +configId,
              });
            }),
          ),
        {
          formatMessage: () => (cleared ? DETAIL_COPY.toast.dissociated : DETAIL_COPY.toast.associated),
          formatReason: (error) => toUserMessage(error, {}, DETAIL_COPY.errors.associate),
        },
      );

      if (success) {
        onDone();
        message.success(DETAIL_COPY.toast.configsUpdated);
      }
    },
    [plugin, connectionId, scopeIds, onDone],
  );
