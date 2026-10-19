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

import type { READINESS_SIGNAL, SIGNAL_STATE } from './constants';

export type ReadinessSignalKey = (typeof READINESS_SIGNAL)[keyof typeof READINESS_SIGNAL];
export type ReadinessSignalState = (typeof SIGNAL_STATE)[keyof typeof SIGNAL_STATE];

export type ReadinessSignal = { key: ReadinessSignalKey; state: ReadinessSignalState; sources: string[] };

export type ProjectReadiness = {
  project: string;
  signals: ReadinessSignal[];
  available: number;
  total: number;
  percentLabel: string | null;
};

export type ReadinessMeterProps = { readiness: ProjectReadiness; large?: boolean };
export type SignalStatusIconProps = { state: ReadinessSignalState; large?: boolean };
