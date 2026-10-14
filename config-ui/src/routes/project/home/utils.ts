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

import type { OtelConnectionResponse } from '@/api/otel';
import type { IProject } from '@/types';

import { CONNECTION_ENTRY_KIND, PROJECT_METRICS } from './constants';
import type { ConnectionEntry, ProjectRow } from './types';

export const toProjectRow = (project: IProject, otelConnections: OtelConnectionResponse[] = []): ProjectRow => ({
  name: project.name,
  connections: project.blueprint?.connections ?? [],
  otelConnections: otelConnections.filter((connection) =>
    connection.projects.some((linked) => linked.name === project.name),
  ),
  isManual: project.blueprint?.isManual ?? false,
  cronConfig: project.blueprint?.cronConfig ?? '',
  createdAt: project.createdAt,
  lastRunCompletedAt: project.lastPipeline?.finishedAt,
  lastRunStatus: project.lastPipeline?.status,
});

export const buildNewProject = (name: string) => ({
  name,
  description: '',
  metrics: PROJECT_METRICS,
});

export const getConnectionEntries = ({ connections, otelConnections }: ProjectRow): ConnectionEntry[] => [
  ...connections.map((connection): ConnectionEntry => ({
    kind: CONNECTION_ENTRY_KIND.PLUGIN,
    key: `${connection.pluginName}-${connection.connectionId}`,
    connection,
  })),
  ...otelConnections.map((connection): ConnectionEntry => ({
    kind: CONNECTION_ENTRY_KIND.OTEL,
    key: `claude_otel-${connection.connection.id}`,
    connection,
  })),
];
