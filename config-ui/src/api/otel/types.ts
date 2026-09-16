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
  organizationId: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OtelProject = {
  name: string;
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
  storageNeedsApplying: boolean;
  projects: OtelProject[];
};

export const AI_METRIC_FAMILY = {
  CORE_ACTIVITY: 'core_activity',
  MODEL_USAGE: 'model_usage',
  TOOL_USAGE: 'tool_usage',
} as const;

export type AiMetricFamily = (typeof AI_METRIC_FAMILY)[keyof typeof AI_METRIC_FAMILY];

export type AiSourcePreference = {
  provider: string;
  workspaceKey: string;
  metricFamily: AiMetricFamily;
  preferredSource: string;
  fallbackSource?: string;
  createdAt: string;
  updatedAt: string;
};

export const OTEL_INGESTION_STATE = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
} as const;

export type OtelIngestionState = (typeof OTEL_INGESTION_STATE)[keyof typeof OTEL_INGESTION_STATE];

export type OtelMetricBatchSummary = {
  id: ID;
  receivedAt: string;
  status: string;
  resourceCount: number;
  datapointCount: number;
  processingErrorCode?: string;
  processedAt?: string;
};

export type OtelIngestionStatus = {
  contractVersion: number;
  state: OtelIngestionState;
  reasons: string[];
  batchCounts: Record<string, number>;
  oldestNonterminal?: {
    receivedAt: string;
    ageSeconds: number;
  };
  converterLease?: {
    leaseUntil: string;
    updatedAt: string;
    ageSeconds: number;
  };
  recentPermanentErrors: number;
  permanentErrorReasons: Array<{ code: string; count: number }>;
  recentBatches: OtelMetricBatchSummary[];
};
