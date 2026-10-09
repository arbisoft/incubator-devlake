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

import { useId } from 'react';

import { selectConnection } from '@/features/connections';
import { useAppSelector } from '@/hooks';
import { getPluginConfig } from '@/plugins/utils';
import { PluginIcon } from '@/ui/plugin-icon';
import { ROW_LINK_VARIANT, RowLink } from '@/ui/row-link';

import { COPY } from './constants';
import { Card, CardCount, CardName } from './styled';
import type { ConnectionCardProps } from './types';
import { toConnectionKey } from './utils';

export const ConnectionCard = ({ plugin, connectionId, scopeCount, href }: ConnectionCardProps) => {
  const nameId = useId();
  const connection = useAppSelector((state) => selectConnection(state, toConnectionKey(plugin, connectionId)));
  const name = connection?.name ?? COPY.connections.unknownName(plugin, connectionId);

  return (
    <Card aria-labelledby={nameId}>
      <PluginIcon icon={getPluginConfig(plugin).icon} size="lg" />
      <div>
        <CardName id={nameId}>{name}</CardName>
        <CardCount>{COPY.connections.scopeCount(scopeCount)}</CardCount>
      </div>
      <RowLink to={href} variant={ROW_LINK_VARIANT.LINK} aria-describedby={nameId}>
        {COPY.connections.editScope}
      </RowLink>
    </Card>
  );
};
