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

import { METER_TONE } from './constants';
import type { MeterTone } from './types';

export const clampFilled = (filled: number, total: number) =>
  Math.min(Math.max(0, Math.floor(filled)), Math.max(0, total));

export const getMeterTone = (filled: number, total: number): MeterTone => {
  const count = clampFilled(filled, total);
  if (count === 0) return METER_TONE.NONE;
  return count >= total ? METER_TONE.COMPLETE : METER_TONE.PARTIAL;
};
