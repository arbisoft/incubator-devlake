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

export const OTEL_ERROR = {
  DUPLICATE_TEAM:
    'Claude Code OTel credentials already exist for this team. Revoke them before generating new settings.',
  CREATE: 'Unable to generate Claude settings. Please try again or contact support.',
  CREDENTIAL_STORAGE: 'Telemetry credential storage is temporarily unavailable. Please retry shortly.',
  LIFECYCLE: 'Unable to update Claude Code OTel credentials. Please try again or contact support.',
  APPLY: 'Credential changes were saved, but the telemetry endpoint could not apply them. Retry Apply shortly.',
} as const;

export const OTEL_LIFECYCLE_ACTION = {
  ROTATE: 'rotate',
  REVOKE: 'revoke',
  HIDE: 'hide',
  FINALIZE: 'finalize',
  APPLY: 'apply',
} as const;

export const OTEL_ATTENTION_CHANGED_EVENT = 'devlake:otel-attention-changed';
export const OTEL_PATH = `${import.meta.env.DEVLAKE_PATH_PREFIX ?? ''}/otel`;
export const OTEL_REFRESH_INTERVAL_MS = 30_000;

