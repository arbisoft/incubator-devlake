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

import { useState } from 'react';

import { AccountBlock, BrandBlock, SidebarNav, type NavItem } from '@/ui';

import { COPY } from './constants';

type DemoSidebarProps = { items: NavItem[]; activePath: string; initiallyCollapsed: boolean };

export const DemoSidebar = ({ items, activePath, initiallyCollapsed }: DemoSidebarProps) => {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  return (
    <SidebarNav
      items={items}
      activePath={activePath}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      header={<BrandBlock collapsed={collapsed} />}
      footer={
        <AccountBlock
          name={COPY.accountBlock.name}
          secondary={COPY.accountBlock.secondary}
          collapsed={collapsed}
          menu={[]}
        />
      }
    />
  );
};
