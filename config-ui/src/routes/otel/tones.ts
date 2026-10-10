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

import { OTEL_BATCH_STATUS, OTEL_INGESTION_STATE, OTEL_STATUS } from '@/api/otel/constants';
import { STATUS_TONE } from '@/ui/constants';

import { CONNECTION_STATE } from './constants';

export const CONNECTION_STATE_TONE = {
  [CONNECTION_STATE.READY]: STATUS_TONE.SUCCESS,
  [CONNECTION_STATE.ACTION_REQUIRED]: STATUS_TONE.WARNING,
  [CONNECTION_STATE.REVOKED]: STATUS_TONE.NEUTRAL,
} as const;

export const CREDENTIAL_TONE = {
  [OTEL_STATUS.ACTIVE]: STATUS_TONE.SUCCESS,
  [OTEL_STATUS.RETIRING]: STATUS_TONE.WARNING,
  [OTEL_STATUS.REVOKED]: STATUS_TONE.NEUTRAL,
} as const;

export const INGESTION_STATE_TONE = {
  [OTEL_INGESTION_STATE.HEALTHY]: STATUS_TONE.SUCCESS,
  [OTEL_INGESTION_STATE.DEGRADED]: STATUS_TONE.WARNING,
  [OTEL_INGESTION_STATE.UNHEALTHY]: STATUS_TONE.ERROR,
} as const;

export const BATCH_STATUS_TONE: Record<string, (typeof STATUS_TONE)[keyof typeof STATUS_TONE]> = {
  [OTEL_BATCH_STATUS.PENDING]: STATUS_TONE.INFO,
  [OTEL_BATCH_STATUS.PROCESSING]: STATUS_TONE.INFO,
  [OTEL_BATCH_STATUS.PROCESSED]: STATUS_TONE.SUCCESS,
  [OTEL_BATCH_STATUS.RETRYABLE_ERROR]: STATUS_TONE.WARNING,
  [OTEL_BATCH_STATUS.PERMANENT_ERROR]: STATUS_TONE.ERROR,
};
