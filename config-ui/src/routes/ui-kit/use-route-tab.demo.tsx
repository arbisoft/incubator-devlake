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

import { Button, Space } from 'antd';
import { useNavigate } from 'react-router-dom';

import { useRouteTab } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { ROUTE_TABS } from './fixtures';

const Tabs = () => {
  const activeKey = useRouteTab(ROUTE_TABS);
  const navigate = useNavigate();
  return (
    <Space orientation="vertical">
      <Space wrap>
        {ROUTE_TABS.map((tab) => (
          <Button key={tab.key} onClick={() => navigate(tab.path)}>
            {COPY.useRouteTab.go(tab.label)}
          </Button>
        ))}
      </Space>
      <span role="status">{COPY.useRouteTab.active(activeKey ?? '')}</span>
    </Space>
  );
};

export const UseRouteTabDemo = () => (
  <DemoSection id={SECTION.USE_ROUTE_TAB} title={COPY.sections.useRouteTab}>
    <DemoCase label={COPY.useRouteTab.hiddenNote}>
      <Tabs />
    </DemoCase>
  </DemoSection>
);
