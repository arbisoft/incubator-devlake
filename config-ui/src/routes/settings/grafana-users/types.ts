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

import type { AccessUser } from '@/api/access';
import type { GrafanaRole, GrafanaUser } from '@/api/grafana-users/types';

import type { GRAFANA_DIALOG, GRAFANA_MENU_ACTION, GRAFANA_ROW_ACTION } from './constants';

export type GrafanaDialog = (typeof GRAFANA_DIALOG)[keyof typeof GRAFANA_DIALOG];
export type GrafanaRowAction = (typeof GRAFANA_ROW_ACTION)[keyof typeof GRAFANA_ROW_ACTION];
export type GrafanaMenuAction = (typeof GRAFANA_MENU_ACTION)[keyof typeof GRAFANA_MENU_ACTION];

export type ProjectOption = { value: string; label: string };

export type DevlakeUserOption = { value: AccessUser['id']; label: string; email: string; name: string };

export type OneTimePassword = { email: string; password: string };

export type GrafanaColumnActions = {
  onRoleChange: (user: GrafanaUser, role: GrafanaRole) => void;
  onToggle: (action: GrafanaRowAction, user: GrafanaUser) => void;
  onRemove: (user: GrafanaUser) => void;
  onEditProjects: (user: GrafanaUser) => void;
  onMenuAction: (user: GrafanaUser, action: GrafanaMenuAction) => void;
};
