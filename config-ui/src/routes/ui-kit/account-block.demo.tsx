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

import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';

import { AccountBlock } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { DarkBox } from './styled';

const { accountBlock: text } = COPY;

export const AccountBlockDemo = () => {
  const [chosen, setChosen] = useState('');
  const menu = [
    { key: 'profile', label: text.profile, icon: <UserOutlined />, onClick: () => setChosen('profile') },
    { key: 'logout', label: text.logout, icon: <LogoutOutlined />, onClick: () => setChosen('logout') },
  ];

  return (
    <DemoSection id={SECTION.ACCOUNT_BLOCK} title={COPY.sections.accountBlock}>
      <DemoCase label={COPY.cases.expanded}>
        <DarkBox $wide>
          <AccountBlock
            name={text.name}
            secondary={text.secondary}
            collapsed={false}
            menu={menu}
            onOpenChange={(open) => open && setChosen('opened')}
          />
        </DarkBox>
        <span role="status">{chosen && text.chosen(chosen)}</span>
      </DemoCase>
      <DemoCase label={COPY.cases.collapsed}>
        <DarkBox>
          <AccountBlock name={text.name} secondary={text.secondary} collapsed menu={menu} />
        </DarkBox>
      </DemoCase>
      <DemoCase label={COPY.cases.longText}>
        <DarkBox $wide>
          <AccountBlock name={text.longName} secondary={text.longSecondary} collapsed={false} menu={menu} />
        </DarkBox>
      </DemoCase>
    </DemoSection>
  );
};
