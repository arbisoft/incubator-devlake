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

import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { PATHS, PROJECT_TAB, type ProjectTab } from '@/config';
import { WEBHOOK_PLUGIN } from '@/features';
import type { IBlueprint, IProject } from '@/types';

import { COPY, DEFAULT_PR_ISSUE_REGEXP, DELETE_WARNING, PROJECT_PLUGIN } from './constants';
import type { DeleteWarning, OtelPlacementState, ProjectPayload, ProjectRouteTab, SettingsForm } from './types';

const TAB_ORDER: ProjectTab[] = [
  PROJECT_TAB.BLUEPRINT,
  PROJECT_TAB.WEBHOOKS,
  PROJECT_TAB.CLAUDE_CODE_OTEL,
  PROJECT_TAB.SETTINGS,
];

export const toProjectTab = (key: string | undefined): ProjectTab =>
  TAB_ORDER.find((tab) => tab === key) ?? PROJECT_TAB.BLUEPRINT;

export const getProjectTabs = (pname: string): ProjectRouteTab[] =>
  TAB_ORDER.map((key) => ({ key, label: COPY.tabs[key], path: PATHS.PROJECT_TAB(pname, key) }));

export const getWebhookIds = (blueprint: IBlueprint | null): ID[] =>
  blueprint?.connections.filter((item) => item.pluginName === WEBHOOK_PLUGIN).map((item) => item.connectionId) ?? [];

export const attachWebhooks = (blueprint: IBlueprint, ids: ID[]): IBlueprint => {
  const attached = getWebhookIds(blueprint);
  return {
    ...blueprint,
    connections: [
      ...blueprint.connections,
      ...ids.filter((id) => !attached.includes(id)).map((id) => ({ pluginName: WEBHOOK_PLUGIN, connectionId: id })),
    ],
  };
};

export const detachWebhook = (blueprint: IBlueprint, id: ID): IBlueprint => ({
  ...blueprint,
  connections: blueprint.connections.filter(
    (item) => !(item.pluginName === WEBHOOK_PLUGIN && item.connectionId === id),
  ),
});

export const readSettingsForm = (project: IProject): SettingsForm => {
  const metric = (plugin: string) => (project.metrics ?? []).find((item) => item.pluginName === plugin);
  return {
    name: project.name,
    dora: metric(PROJECT_PLUGIN.DORA)?.enable ?? false,
    linker: metric(PROJECT_PLUGIN.LINKER)?.enable ?? false,
    linkerRegexp: metric(PROJECT_PLUGIN.LINKER)?.pluginOption?.prToIssueRegexp ?? DEFAULT_PR_ISSUE_REGEXP,
    issueTrace: metric(PROJECT_PLUGIN.ISSUE_TRACE)?.enable ?? false,
  };
};

export const buildProjectPayload = (form: SettingsForm): ProjectPayload => ({
  name: form.name,
  description: '',
  metrics: [
    { pluginName: PROJECT_PLUGIN.DORA, pluginOption: {}, enable: form.dora },
    { pluginName: PROJECT_PLUGIN.LINKER, pluginOption: { prToIssueRegexp: form.linkerRegexp }, enable: form.linker },
    { pluginName: PROJECT_PLUGIN.ISSUE_TRACE, pluginOption: {}, enable: form.issueTrace },
  ],
});

export const getOtelPlacementState = (connections?: OtelConnectionResponse[]): OtelPlacementState => ({
  hasPlacements: Boolean(connections?.length),
  hasActiveFinal: Boolean(
    connections?.some(({ connection, projects }) => connection.status === OTEL_STATUS.ACTIVE && projects.length === 1),
  ),
});

export const getDeleteWarnings = ({ hasPlacements, hasActiveFinal }: OtelPlacementState): DeleteWarning[] => {
  if (!hasPlacements) return [];
  return [hasActiveFinal ? DELETE_WARNING.OTEL_FINAL_ACTIVE : DELETE_WARNING.OTEL_REMOVED];
};
