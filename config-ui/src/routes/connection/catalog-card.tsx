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
import { useEffect, useRef } from 'react';

import type { IConnection } from '@/types';
import { IntegrationCard, StatusBadge, STATUS_BADGE_VARIANT } from '@/ui';
import { useInView } from '@/ui/hooks';

import { buildOtelBadges } from './catalog-utils';
import { CARD_MENU_KEY, COPY } from './constants';
import { Cell } from './styled';
import type { IntegrationSummary } from './types';

type CatalogCardProps = {
  item: IntegrationSummary;
  connections: IConnection[];
  onCheck: (connections: IConnection[]) => void;
  onManage: (item: IntegrationSummary) => void;
  onAdd: (item: IntegrationSummary) => void;
};

export const CatalogCard = ({ item, connections, onCheck, onManage, onAdd }: CatalogCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView && connections.length > 0) onCheck(connections);
  }, [inView, connections, onCheck]);

  const menu = item.href
    ? [{ key: CARD_MENU_KEY.OPEN, label: COPY.menu.open, onClick: () => onManage(item) }]
    : [
        { key: CARD_MENU_KEY.MANAGE, label: COPY.menu.manage, onClick: () => onManage(item) },
        { key: CARD_MENU_KEY.ADD, label: COPY.menu.add, onClick: () => onAdd(item) },
      ];

  return (
    <Cell ref={ref}>
      <IntegrationCard
        icon={item.icon}
        name={item.name}
        category={item.category}
        beta={item.beta}
        deprecated={item.deprecated}
        connected={item.connections}
        failed={item.failed}
        details={
          item.otel &&
          buildOtelBadges(item.otel).map(({ tone, label }) => (
            <StatusBadge key={label} tone={tone} label={label} variant={STATUS_BADGE_VARIANT.DOT} />
          ))
        }
        menu={menu}
        docsHref={item.docsHref}
        onManage={() => onManage(item)}
        onAdd={() => onAdd(item)}
      />
    </Cell>
  );
};
