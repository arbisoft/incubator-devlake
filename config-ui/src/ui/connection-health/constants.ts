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

import { STATUS_TONE } from '@/ui/constants';

export const CONNECTION_HEALTH_STATE = { ONLINE: 'online', OFFLINE: 'offline', UNKNOWN: 'unknown' } as const;

export const COPY = {
  online: 'Connected',
  offline: 'Failed',
  unknown: 'Not tested',
  testing: 'Testing',
  retest: 'Retest connection',
  testedAt: (when: string) => `Tested ${when.toLowerCase()}`,
};

export const STATE_TONE = {
  [CONNECTION_HEALTH_STATE.ONLINE]: STATUS_TONE.SUCCESS,
  [CONNECTION_HEALTH_STATE.OFFLINE]: STATUS_TONE.ERROR,
  [CONNECTION_HEALTH_STATE.UNKNOWN]: STATUS_TONE.NEUTRAL,
} as const;

export const STATE_LABEL = {
  [CONNECTION_HEALTH_STATE.ONLINE]: COPY.online,
  [CONNECTION_HEALTH_STATE.OFFLINE]: COPY.offline,
  [CONNECTION_HEALTH_STATE.UNKNOWN]: COPY.unknown,
} as const;
