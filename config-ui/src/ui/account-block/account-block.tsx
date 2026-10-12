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

import { EllipsisOutlined, UserOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';

import { COPY } from './constants';
import { Avatar, Copy, Expanded, Name, Rail, Secondary } from './styled';
import type { AccountBlockProps } from './types';
import { getInitials } from './utils';

export const AccountBlock = ({ name, secondary, collapsed, menu }: AccountBlockProps) => (
  <Dropdown menu={{ items: menu }} trigger={collapsed ? ['hover', 'click'] : ['click']} placement="topLeft">
    {collapsed ? (
      <Rail type="button" aria-label={COPY.menu(name)}>
        <Avatar aria-hidden>{getInitials(name)}</Avatar>
      </Rail>
    ) : (
      <Expanded type="button">
        <UserOutlined aria-hidden />
        <Copy>
          <Name>{name}</Name>
          <Secondary>{secondary}</Secondary>
        </Copy>
        <EllipsisOutlined aria-hidden />
      </Expanded>
    )}
  </Dropdown>
);
