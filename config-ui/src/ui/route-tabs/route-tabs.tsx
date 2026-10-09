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
import { useNavigate } from 'react-router-dom';

import { FILTER_TABS_VARIANT, FilterTabs } from '@/ui/filter-tabs';
import { useRouteTab } from '@/ui/hooks';

import { ROUTE_TABS_VARIANT } from './constants';
import type { RouteTabsProps } from './types';

export const RouteTabs = ({ items, variant }: RouteTabsProps) => {
  const navigate = useNavigate();
  const activeKey = useRouteTab(items);
  const visible = useMemo(() => items.filter((item) => item.visible !== false), [items]);

  return (
    <FilterTabs
      items={visible.map(({ key, label }) => ({ key, label }))}
      value={activeKey ?? ''}
      variant={variant === ROUTE_TABS_VARIANT.SEGMENTED ? FILTER_TABS_VARIANT.PILL : FILTER_TABS_VARIANT.FLAT}
      onChange={(key) => {
        const target = visible.find((item) => item.key === key);
        if (target) navigate(target.path);
      }}
    />
  );
};
