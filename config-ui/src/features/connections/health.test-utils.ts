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

import { IConnectionStatus, type IConnection } from '@/types';

import { HEALTH_FAILURE_REASON } from './constants';
import type { ConnectionHealthEntry } from './types';

export const NOW = 1_700_000_000_000;
export const MINUTE_MS = 60_000;
export const SECRET_FREE_MESSAGE = 'StatusUnauthorized error when testing connection';
export const INVALID_TOKEN_MESSAGE = 'Invalid token. You may need to edit your token';
export const CLEANED_GITHUB_MESSAGE = 'StatusUnauthorized error when testing connection (400)';
export const IGNORED_REQUEST_TEXT = 'ignored request text';

export const connection = (unique: string) => ({ unique }) as IConnection;
export const online = (testedAt: number): ConnectionHealthEntry => ({ status: IConnectionStatus.ONLINE, testedAt });
export const offline = (testedAt: number): ConnectionHealthEntry => ({
  status: IConnectionStatus.OFFLINE,
  reason: HEALTH_FAILURE_REASON.FAILED,
  testedAt,
});
export const GITHUB_DUMP = [
  'attached stack trace',
  '  -- stack trace:',
  '  | github.com/apache/incubator-devlake/plugins/github/api.testGithubConnAccessTokenAuth',
  '  | \t/app/plugins/github/api/connection_api.go:212',
  'Wraps: (2) StatusUnauthorized error when testing connection (400)',
  'Error types: (1) *withstack.withStack (2) *errutil.leafError',
].join('\n');
export const CONNECT_DUMP = [
  'attached stack trace',
  '  | github.com/apache/incubator-devlake/core/utils.CheckNetwork',
  'Wraps: (2) Failed to connect',
  'Wraps: (3) attached stack trace',
  'Wraps: (4) dial tcp 127.0.0.1:9: connect: connection refused',
].join('\n');
export const axiosLike = (status: number | undefined, message?: string) => ({
  message: 'Request failed',
  response: status === undefined ? undefined : { status, data: message ? { message } : undefined },
});
