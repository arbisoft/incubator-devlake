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

import type { NavItem } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { DemoSidebar } from './demo-sidebar';
import { LONG_NAV_ITEMS, NAV_ITEMS } from './nav-fixtures';
import { Box, Row } from './styled';

const { sidebarNav: text } = COPY;

type NavBoxProps = { items: NavItem[]; initiallyCollapsed: boolean; activePath: string };

const NavBox = (props: NavBoxProps) => (
  <Box>
    <DemoSidebar {...props} />
  </Box>
);

export const SidebarNavDemo = () => {
  const { pathname } = useLocation();
  return (
    <DemoSection id={SECTION.SIDEBAR_NAV} title={COPY.sections.sidebarNav}>
      <DemoCase label={`${COPY.cases.expanded}. ${text.active(pathname)}`}>
        <Row>
          <NavBox items={NAV_ITEMS} initiallyCollapsed={false} activePath={pathname} />
        </Row>
      </DemoCase>
      <DemoCase label={COPY.cases.railFlyout}>
        <Row>
          <NavBox items={NAV_ITEMS} initiallyCollapsed activePath={pathname} />
        </Row>
      </DemoCase>
      <DemoCase label={COPY.cases.longText}>
        <Row>
          <NavBox items={LONG_NAV_ITEMS} initiallyCollapsed={false} activePath={pathname} />
        </Row>
      </DemoCase>
    </DemoSection>
  );
};
