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

import { request } from '@/utils';

import { OTEL_ACTION_PATH } from './constants';
import type { AiSourcePreference, OtelConnectionResponse, OtelIngestionStatus, OtelProject } from './types';
import { CONNECTIONS_PATH, OTEL_BASE_PATH, otelAction } from './utils';

export * from './constants';
export * from './types';

const sourcePreferencesPath = `${OTEL_BASE_PATH}/source-preferences`;

export const list = (signal?: AbortSignal): Promise<OtelConnectionResponse[]> => request(CONNECTIONS_PATH, { signal });

export const listSourcePreferences = (signal?: AbortSignal): Promise<AiSourcePreference[]> =>
  request(sourcePreferencesPath, { signal });

export const ingestionStatus = (signal?: AbortSignal): Promise<OtelIngestionStatus> =>
  request(`${OTEL_BASE_PATH}/ingestion-status`, { signal });

export const metricBatchPayload = (id: ID, signal?: AbortSignal): Promise<unknown> =>
  request(`${OTEL_BASE_PATH}/metric-batches/${id}/payload`, { signal });

export const create = (data: { teamName: string; projectNames: string[] }) =>
  request(CONNECTIONS_PATH, {
    method: 'POST',
    data,
  }) as Promise<OtelConnectionResponse>;

export const rotate = otelAction(OTEL_ACTION_PATH.ROTATE);
export const revoke = otelAction(OTEL_ACTION_PATH.REVOKE);
export const hide = otelAction(OTEL_ACTION_PATH.HIDE);
export const finalizeRotation = otelAction(OTEL_ACTION_PATH.FINALIZE_ROTATION);
export const apply = otelAction(OTEL_ACTION_PATH.APPLY);

export const listProjects = (signal?: AbortSignal): Promise<OtelProject[]> =>
  request(`${OTEL_BASE_PATH}/projects`, { signal });

export const listForProject = (projectName: string, signal?: AbortSignal): Promise<OtelConnectionResponse[]> =>
  request(`${OTEL_BASE_PATH}/projects/${encodeURIComponent(projectName)}/connections`, { signal });

export const updateProjects = (id: ID, projectNames: string[]): Promise<OtelProject[]> =>
  request(`${CONNECTIONS_PATH}/${id}/projects`, {
    method: 'PUT',
    data: { projectNames },
  });

export const validateProjectRemoval = (projectName: string): Promise<void> =>
  request(`${OTEL_BASE_PATH}/projects/${encodeURIComponent(projectName)}/removal-preflight`, {
    method: 'POST',
  });
