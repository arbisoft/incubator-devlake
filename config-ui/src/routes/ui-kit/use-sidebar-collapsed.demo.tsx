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

import { Switch } from 'antd';

import { useSidebarCollapsed } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Row } from './styled';

export const UseSidebarCollapsedDemo = () => {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const text = COPY.useSidebarCollapsed;
  return (
    <DemoSection id={SECTION.USE_SIDEBAR_COLLAPSED} title={COPY.sections.useSidebarCollapsed}>
      <DemoCase label={text.note}>
        <Row>
          <Switch checked={collapsed} onChange={setCollapsed} aria-label={text.collapsed} />
          <span role="status">{collapsed ? text.collapsed : text.expanded}</span>
        </Row>
      </DemoCase>
    </DemoSection>
  );
};
