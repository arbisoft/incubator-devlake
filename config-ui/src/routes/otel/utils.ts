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

import axios, { HttpStatusCode } from 'axios';

const duplicateTeamMessage = 'Claude Code OTel credentials already exist for this team. Revoke them before generating new settings.';
const genericCreateError = 'Unable to generate Claude settings. Please try again or contact support.';
const credentialStorageError = 'Telemetry credential storage is temporarily unavailable. Please retry shortly.';
const genericLifecycleError = 'Unable to update Claude Code OTel credentials. Please try again or contact support.';
const RETRYABLE_LIFECYCLE_STATUSES: readonly number[] = [
  HttpStatusCode.BadRequest,
  HttpStatusCode.Conflict,
  HttpStatusCode.TooManyRequests,
];

type OtelErrorResponse = { message?: unknown };

// Surface only explicit validation messages; unexpected backend failures remain generic.
export const getOtelCreateError = (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === HttpStatusCode.ServiceUnavailable) {
    return credentialStorageError;
  }
  if (!axios.isAxiosError<OtelErrorResponse>(error) || error.response?.status !== HttpStatusCode.BadRequest) {
    return genericCreateError;
  }

  const serverMessage = typeof error.response.data?.message === 'string' ? error.response.data.message : '';
  if (serverMessage.includes('a Claude Code OTel connection already exists for this team')) return duplicateTeamMessage;

  return serverMessage || genericCreateError;
};

// Surface only known operational responses; filesystem details and stack traces stay server-side.
export const getOtelLifecycleError = (error: unknown) => {
  if (!axios.isAxiosError<OtelErrorResponse>(error)) return genericLifecycleError;

  const { status, data } = error.response ?? {};
  if (status === HttpStatusCode.ServiceUnavailable) return credentialStorageError;

  const serverMessage = typeof data?.message === 'string' ? data.message : '';
  if (status !== undefined && RETRYABLE_LIFECYCLE_STATUSES.includes(status)) {
    return serverMessage || genericLifecycleError;
  }

  return genericLifecycleError;
};
