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

import { useAppSelector } from '@/hooks';
import { getConnectorVisual } from '@/plugins/utils';
import { PluginIcon } from '@/ui';

import { COPY, WEBHOOK_PLUGIN } from '../constants';
import { selectConnection, selectWebhook } from '../slice';

import { Wrapper } from './styled';
import type { ConnectionNameProps } from './types';

export const ConnectionName = ({ plugin, connectionId }: ConnectionNameProps) => {
  const connection = useAppSelector((state) => selectConnection(state, `${plugin}-${connectionId}`));
  const webhook = useAppSelector((state) =>
    plugin === WEBHOOK_PLUGIN ? selectWebhook(state, connectionId) : undefined,
  );
  const name = connection?.name ?? webhook?.name ?? COPY.connectionNameFallback(plugin, connectionId);

  return (
    <Wrapper>
      <PluginIcon {...getConnectorVisual(plugin)} size="md" />
      <span className="name" title={name}>
        {name}
      </span>
    </Wrapper>
  );
};
