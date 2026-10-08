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

export const OTEL_STATUS = {
  ACTIVE: 'active',
  RETIRING: 'retiring',
  REVOKED: 'revoked',
} as const;

export const AI_METRIC_FAMILY = {
  CORE_ACTIVITY: 'core_activity',
  MODEL_USAGE: 'model_usage',
  TOOL_USAGE: 'tool_usage',
} as const;

export const OTEL_INGESTION_STATE = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
} as const;

export const OTEL_BATCH_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  RETRYABLE_ERROR: 'retryable_error',
  PERMANENT_ERROR: 'permanent_error',
} as const;

export const OTEL_ACTION_PATH = {
  ROTATE: 'rotate',
  REVOKE: 'revoke',
  HIDE: 'hide',
  FINALIZE_ROTATION: 'finalize-rotation',
  APPLY: 'apply',
} as const;
