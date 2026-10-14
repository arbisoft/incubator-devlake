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
import type { IConnectionStatus } from '@/types';

import type { HEALTH_FAILURE_REASON } from './constants';

export type HealthFailureReason = (typeof HEALTH_FAILURE_REASON)[keyof typeof HEALTH_FAILURE_REASON];

export type ConnectionHealthEntry = {
  status: IConnectionStatus.ONLINE | IConnectionStatus.OFFLINE;
  reason?: HealthFailureReason;
  message?: string;
  testedAt: number;
};

export type ConnectionHealthMap = Record<string, ConnectionHealthEntry>;

export type TestFailureInput = { status?: number; message?: string };
