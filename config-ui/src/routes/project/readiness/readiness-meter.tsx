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

import { METER_SIZE, SegmentedMeter } from '@/ui';

import { COPY } from './constants';
import type { ReadinessMeterProps } from './types';

export const ReadinessMeter = ({ readiness, large = false }: ReadinessMeterProps) => (
  <SegmentedMeter
    total={readiness.total}
    filled={readiness.available}
    size={large ? METER_SIZE.MD : METER_SIZE.SM}
    label={COPY.summary(readiness.available, readiness.total)}
  />
);
