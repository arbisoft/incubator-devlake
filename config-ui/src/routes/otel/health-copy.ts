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

import { OTEL_BATCH_STATUS, OTEL_INGESTION_STATE } from '@/api/otel/constants';

export const HEALTH_COPY = {
  title: 'Telemetry ingestion',
  tableLabel: 'Recent telemetry batches',
  batchesTitle: 'Recent batches',
  loading: 'Loading ingestion status...',
  unavailable: 'Ingestion status is unavailable.',
  batchesUnavailable: 'Telemetry batches could not be loaded.',
  retry: 'Retry',
  state: {
    [OTEL_INGESTION_STATE.HEALTHY]: 'Healthy',
    [OTEL_INGESTION_STATE.DEGRADED]: 'Degraded',
    [OTEL_INGESTION_STATE.UNHEALTHY]: 'Unhealthy',
  },
  metrics: {
    pending: 'Pending',
    retrying: 'Retrying',
    oldestBacklog: 'Oldest backlog',
    permanentErrors: 'Permanent errors (24h)',
    converter: 'Converter',
    logPending: 'Log batches pending',
    logRetrying: 'Log batches retrying',
    logReplaying: 'Log batches replaying',
    logOldestBacklog: 'Oldest log backlog',
    logPermanentErrors: 'Log permanent errors (24h)',
  },
  converter: { unavailable: 'Unavailable', active: 'Active', expired: 'Lease expired' },
  none: 'None',
  seconds: (value: number) => `${value}s`,
  minutes: (value: number) => `${value}m`,
  batchStatus: {
    [OTEL_BATCH_STATUS.PENDING]: 'Pending',
    [OTEL_BATCH_STATUS.PROCESSING]: 'Processing',
    [OTEL_BATCH_STATUS.PROCESSED]: 'Processed',
    [OTEL_BATCH_STATUS.RETRYABLE_ERROR]: 'Retrying',
    [OTEL_BATCH_STATUS.PERMANENT_ERROR]: 'Permanent error',
    [OTEL_BATCH_STATUS.REPLAY_PENDING]: 'Replaying',
  },
  columns: { received: 'Received', status: 'Status', datapoints: 'Datapoints', actions: 'Actions' },
  emptyBatches: {
    title: 'No telemetry batches yet',
    description: 'Batches appear here as Claude Code sends telemetry.',
  },
  viewPayload: 'View payload',
  viewPayloadFor: (time: string) => `View payload for the batch received ${time}`,
  payloadTitle: 'OTLP payload',
  payloadCopy: 'Copy payload',
  payloadError: 'Unable to load the telemetry payload.',
  payloadRetry: 'Retry loading payload',
};
