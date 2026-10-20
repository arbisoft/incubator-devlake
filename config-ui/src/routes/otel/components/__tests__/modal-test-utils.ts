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

import { message } from 'antd';
import { vi } from 'vitest';

import { OTEL_STATUS, type OtelConnection, type OtelConnectionResponse } from '@/api/otel';

export const connection = (overrides: Partial<OtelConnection> = {}): OtelConnectionResponse => ({
  connection: {
    id: 7,
    name: 'claude-platform',
    teamName: 'Platform',
    teamSlug: 'platform',
    collectorEndpoint: 'https://collector.example.com',
    protocol: 'http',
    status: OTEL_STATUS.ACTIVE,
    organizationId: null,
    revokedAt: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  },
  credentials: [],
  restartRequired: false,
  recoveryRequired: false,
  storageNeedsApplying: false,
  projects: [{ name: 'Project Alpha' }],
});

export const isDisabled = (button: HTMLElement) => button.getAttribute('aria-disabled') === 'true';

const FEEDBACK_KINDS = ['success', 'error', 'warning', 'info'] as const;

export const silenceFeedback = () => {
  vi.clearAllMocks();
  FEEDBACK_KINDS.forEach((kind) => vi.spyOn(message, kind).mockImplementation(() => undefined as never));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
};

export const MANAGED_ENV = {
  CLAUDE_CODE_ENABLE_TELEMETRY: '1',
  OTEL_METRICS_EXPORTER: 'otlp',
  OTEL_LOGS_EXPORTER: 'otlp',
  OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example.com',
  OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic ZTJl',
  OTEL_METRIC_EXPORT_INTERVAL: '60000',
  OTEL_METRICS_INCLUDE_SESSION_ID: 'true',
  OTEL_METRICS_INCLUDE_ACCOUNT_UUID: 'true',
  OTEL_METRICS_INCLUDE_REPOSITORY: 'true',
  OTEL_LOG_TOOL_DETAILS: '1',
  OTEL_LOG_USER_PROMPTS: '1',
  OTEL_LOG_ASSISTANT_RESPONSES: '0',
  OTEL_LOG_TOOL_CONTENT: '0',
  OTEL_LOG_RAW_API_BODIES: '0',
};
