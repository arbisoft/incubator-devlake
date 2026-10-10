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
import { PROJECT_TAB } from '../app-copy';

export type ProjectTabKey = (typeof PROJECT_TAB)[keyof typeof PROJECT_TAB];

export const PROJECT_TABS: readonly ProjectTabKey[] = Object.values(PROJECT_TAB);

// App routes the e2e suite visits; mirrors src/config/paths.ts without importing from src.
export const PATHS = {
  root: '/',
  login: '/login',
  dbMigrate: '/db-migrate',
  projects: '/projects',
  project: (name: string) => `/projects/${encodeURIComponent(name)}`,
  projectTab: (name: string, tab: ProjectTabKey) => `/projects/${encodeURIComponent(name)}/${tab}`,
  projectConnection: (name: string, unique: string) =>
    `/projects/${encodeURIComponent(name)}/blueprint/connections/${unique}`,
  projectConnectionLegacy: (name: string, unique: string) => `/projects/${encodeURIComponent(name)}/${unique}`,
  connections: '/connections',
  connection: (plugin: string, id: number) => `/connections/${plugin}/${id}`,
  blueprints: '/advanced/blueprints',
  blueprint: (id: number) => `/advanced/blueprints/${id}`,
  blueprintConnection: (id: number, unique: string) => `/advanced/blueprints/${id}/connections/${unique}`,
  blueprintConnectionLegacy: (id: number, unique: string) => `/advanced/blueprints/${id}/${unique}`,
  pipelines: '/advanced/pipelines',
  pipeline: (id: number) => `/advanced/pipeline/${id}`,
  keys: '/keys',
  access: '/access',
  settingsUsers: '/settings/users',
  settingsGrafanaUsers: '/settings/users/grafana',
  settingsAuthentication: '/settings/authentication',
  settingsActivity: '/settings/activity',
  otel: '/otel',
  onboard: '/onboard',
  uiKit: '/ui-kit',
};
