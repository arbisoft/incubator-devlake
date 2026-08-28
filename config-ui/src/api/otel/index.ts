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

import type { OtelConnectionResponse, OtelProject } from './types';

export * from './types';

const basePath = '/plugins/claude_otel/connections';

export const list = (signal?: AbortSignal): Promise<OtelConnectionResponse[]> => request(basePath, { signal });

export const create = (data: { teamName: string; projectNames: string[] }) =>
  request(basePath, {
    method: 'POST',
    data,
  }) as Promise<OtelConnectionResponse>;

// Keep credential lifecycle requests consistent across the management actions.
const otelAction =
  (action: string) =>
  (id: ID): Promise<OtelConnectionResponse> =>
    request(`${basePath}/${id}/${action}`, {
      method: 'POST',
    });

export const rotate = otelAction('rotate');
export const revoke = otelAction('revoke');
export const hide = otelAction('hide');
export const finalizeRotation = otelAction('finalize-rotation');
export const apply = otelAction('apply');

export const listProjects = (): Promise<OtelProject[]> => request('/plugins/claude_otel/projects');

export const listForProject = (projectName: string): Promise<OtelConnectionResponse[]> =>
  request(`/plugins/claude_otel/projects/${encodeURIComponent(projectName)}/connections`);

export const updateProjects = (id: ID, projectNames: string[]): Promise<OtelProject[]> =>
  request(`${basePath}/${id}/projects`, {
    method: 'PUT',
    data: { projectNames },
  });

export const validateProjectRemoval = (projectName: string): Promise<void> =>
  request(`/plugins/claude_otel/projects/${encodeURIComponent(projectName)}/removal-preflight`, {
    method: 'POST',
  });

export const removeProjectPlacements = (projectName: string): Promise<void> =>
  request(`/plugins/claude_otel/projects/${encodeURIComponent(projectName)}/placements`, {
    method: 'DELETE',
  });
