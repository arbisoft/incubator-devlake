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
export const WEBHOOK_PLUGIN = 'webhook';

export const HEALTH_TTL_MS = 30 * 60 * 1000;
export const HEALTH_CONCURRENCY = 3;
export const HEALTH_STORAGE_KEY = 'devlake.connectionHealth';

export const HEALTH_FAILURE_REASON = {
  CREDENTIALS: 'credentials',
  UNREACHABLE: 'unreachable',
  FAILED: 'failed',
} as const;

export const COPY = {
  failure: {
    [HEALTH_FAILURE_REASON.CREDENTIALS]: 'Credentials rejected',
    [HEALTH_FAILURE_REASON.UNREACHABLE]: 'Unreachable',
    [HEALTH_FAILURE_REASON.FAILED]: 'Connection failed',
  },
};

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  REQUEST_TIMEOUT: 408,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export const UNREACHABLE_STATUSES: readonly number[] = [
  HTTP_STATUS.REQUEST_TIMEOUT,
  HTTP_STATUS.BAD_GATEWAY,
  HTTP_STATUS.SERVICE_UNAVAILABLE,
  HTTP_STATUS.GATEWAY_TIMEOUT,
];

export const REJECTED_STATUSES: readonly number[] = [HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN];

// Plugins report a rejected credential as a 400, a 200 with success false, or a message only.
export const CREDENTIAL_MESSAGE =
  /unauthori[sz]ed|forbidden|\b40[13]\b|invalid token|bad credentials|verify token failed|authenticat/i;

export const UNREACHABLE_MESSAGE =
  /failed to connect|resolve dns|connection refused|no such host|timed? ?out|network error|i\/o timeout|dial tcp/i;

export const MESSAGE_MAX_LENGTH = 200;

// Marks a Go error dump, whose readable summary is in its first "Wraps" line.
export const ERROR_DUMP_MARKER = 'stack trace';
export const ERROR_DUMP_SUMMARY = /^Wraps: \(\d+\) (.+)$/;
export const ERROR_DUMP_NOISE = 'attached stack trace';
