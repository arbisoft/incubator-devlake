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
import type { IBlueprint, IPipelineStatus } from '@/types';

import type { CONNECTION_ENTRY_KIND, PROJECT_COLUMN } from './constants';

export type ProjectSortKey =
  typeof PROJECT_COLUMN.NAME | typeof PROJECT_COLUMN.CREATED_AT | typeof PROJECT_COLUMN.LAST_RUN_AT;

export type ProjectRow = {
  name: string;
  connections: IBlueprint['connections'];
  otelConnections: OtelConnectionResponse[];
  isManual: boolean;
  cronConfig: string;
  createdAt?: string;
  lastRunCompletedAt?: string | null;
  lastRunStatus?: IPipelineStatus;
};

type PluginConnection = IBlueprint['connections'][number];

export type ConnectionEntry =
  | { kind: typeof CONNECTION_ENTRY_KIND.PLUGIN; key: string; connection: PluginConnection }
  | { kind: typeof CONNECTION_ENTRY_KIND.OTEL; key: string; connection: OtelConnectionResponse };
