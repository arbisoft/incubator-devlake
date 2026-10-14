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

import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown, Tooltip, type MenuProps } from 'antd';

import { COPY, GRAFANA_MENU_ACTION } from '../constants';
import type { GrafanaMenuAction } from '../types';
import { getMenuActions } from '../utils';

import type { GrafanaMoreMenuProps } from './types';

const MENU_LABEL = {
  [GRAFANA_MENU_ACTION.DETAILS]: COPY.actions.editDetails,
  [GRAFANA_MENU_ACTION.PASSWORD]: COPY.actions.setPassword,
};

export const GrafanaMoreMenu = ({ user, onSelect }: GrafanaMoreMenuProps) => {
  const items: MenuProps['items'] = getMenuActions(user).map((key) => ({ key, label: MENU_LABEL[key] }));
  const label = COPY.actions.moreFor(user.email);

  return (
    <Dropdown trigger={['click']} menu={{ items, onClick: ({ key }) => onSelect(key as GrafanaMenuAction) }}>
      <Tooltip title={label}>
        <Button type="text" icon={<MoreOutlined />} aria-label={label} />
      </Tooltip>
    </Dropdown>
  );
};
