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

import { useMemo } from 'react';

import type { OtelConnectionResponse } from '@/api/otel';
import { selectAllConnections, selectWebhooks, WEBHOOK_PLUGIN } from '@/features/connections';
import { useAppSelector } from '@/hooks';
import { getPluginConfig } from '@/plugins';
import type { ListFilterOption } from '@/ui';

import { COPY, OTEL_INTEGRATION_KEY } from './constants';

const VALUE_SEPARATOR = ':';

type Options = { includeOtel: boolean; otelConnections?: OtelConnectionResponse[] };

const toOption = (plugin: string, id: ID, name: string, pluginLabel: string): ListFilterOption & { text: string } => ({
  text: `${name} (${pluginLabel})`,
  value: `${plugin}${VALUE_SEPARATOR}${id}`,
});

export const useConnectionFilterOptions = ({ includeOtel, otelConnections = [] }: Options) => {
  const connections = useAppSelector(selectAllConnections);
  const webhooks = useAppSelector(selectWebhooks);

  return useMemo(() => {
    const webhookLabel = getPluginConfig(WEBHOOK_PLUGIN).name;
    const options = [
      ...connections.map(({ plugin, id, name, pluginName }) => toOption(plugin, id, name, pluginName)),
      ...webhooks.map(({ id, name }) => toOption(WEBHOOK_PLUGIN, id, name, webhookLabel)),
      ...(includeOtel
        ? otelConnections.map(({ connection }) =>
            toOption(OTEL_INTEGRATION_KEY, connection.id, connection.name, COPY.otelName),
          )
        : []),
    ];
    return options.sort((a, b) => a.text.localeCompare(b.text));
  }, [connections, webhooks, includeOtel, otelConnections]);
};
