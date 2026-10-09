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

import { useLocation } from 'react-router-dom';

import { ROUTE_TABS_VARIANT, RouteTabs } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { ROUTE_TABS } from './fixtures';

const { routeTabs: text } = COPY;

export const RouteTabsDemo = () => {
  const { pathname } = useLocation();
  return (
    <DemoSection id={SECTION.ROUTE_TABS} title={COPY.sections.routeTabs}>
      <DemoCase label={`${COPY.cases.tabs}. ${text.note}`}>
        <RouteTabs items={ROUTE_TABS} variant={ROUTE_TABS_VARIANT.TABS} />
      </DemoCase>
      <DemoCase label={COPY.cases.segmented}>
        <RouteTabs items={ROUTE_TABS} variant={ROUTE_TABS_VARIANT.SEGMENTED} />
        <span role="status">{text.path(pathname)}</span>
      </DemoCase>
    </DemoSection>
  );
};
