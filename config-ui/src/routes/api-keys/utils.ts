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

import dayjs from 'dayjs';

import { API_REST_PATH, EXPIRATION_DAYS, EXPIRY_STATE, EXPIRY_TONE } from './constants';
import type { ExpirationKey, ExpiryState } from './types';

export const getExpiryState = (expiredAt: string | null | undefined, now: number = Date.now()): ExpiryState => {
  if (!expiredAt) return EXPIRY_STATE.NEVER;
  return dayjs(now).isAfter(dayjs(expiredAt)) ? EXPIRY_STATE.EXPIRED : EXPIRY_STATE.ACTIVE;
};

export const getExpiryTone = (state: ExpiryState) => EXPIRY_TONE[state];

export const getExpiresAt = (expiration: ExpirationKey, now: number = Date.now()): string | undefined => {
  const days = EXPIRATION_DAYS[expiration];
  return days === null ? undefined : dayjs(now).add(days, 'd').toISOString();
};

export const getPathPrefix = (origin: string) => `${origin}${API_REST_PATH}`;
