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

import { PATHS, USER_MANAGEMENT_VIEW, type UserManagementView } from '@/config';
import { toRouteTabs, toTabKey } from '@/ui/utils';

import { COPY, USER_MANAGEMENT_VIEW_ORDER } from './constants';

const VIEW_PATH: Record<UserManagementView, string> = {
  [USER_MANAGEMENT_VIEW.DEVLAKE]: PATHS.SETTINGS_USERS(),
  [USER_MANAGEMENT_VIEW.GRAFANA]: PATHS.SETTINGS_GRAFANA_USERS(),
};

export const getUserManagementViews = () => toRouteTabs(USER_MANAGEMENT_VIEW_ORDER, COPY.views, VIEW_PATH);

export const toUserManagementView = (key: string | undefined): UserManagementView =>
  toTabKey(USER_MANAGEMENT_VIEW_ORDER, key, USER_MANAGEMENT_VIEW.DEVLAKE);
