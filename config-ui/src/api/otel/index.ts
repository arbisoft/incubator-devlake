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

export const OTEL_CONNECTION_STATUS = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
} as const;

export type OtelConnectionStatus = (typeof OTEL_CONNECTION_STATUS)[keyof typeof OTEL_CONNECTION_STATUS];

export const OTEL_CREDENTIAL_STATUS = {
  ACTIVE: 'active',
  RETIRING: 'retiring',
  REVOKED: 'revoked',
} as const;

export type OtelCredentialStatus = (typeof OTEL_CREDENTIAL_STATUS)[keyof typeof OTEL_CREDENTIAL_STATUS];

export type OtelConnection = {
  id: ID;
  name: string;
  teamName: string;
  teamSlug: string;
  collectorEndpoint: string;
  protocol: string;
  status: OtelConnectionStatus;
  createdAt: string;
  updatedAt: string;
};

export type OtelCredential = {
  id: ID;
  connectionId: ID;
  username: string;
  status: OtelCredentialStatus;
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string;
  revokedAt?: string;
  pendingCollectorRestart: boolean;
  lastCollectorRestartHint?: string;
};

export type OtelConnectionResponse = {
  connection: OtelConnection;
  credentials: OtelCredential[];
  managedSettings?: {
    env: Record<string, string>;
  };
  restartRequired: boolean;
  restartHint?: string;
  recoveryRequired: boolean;
};

const basePath = '/plugins/claude_otel/connections';

export const list = (): Promise<OtelConnectionResponse[]> => request(basePath);

export const create = (data: { teamName: string }) =>
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
