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

import { Root, Segment } from './styled';
import type { SegmentedMeterProps } from './types';
import { clampFilled, getMeterTone } from './utils';

export const SegmentedMeter = ({ total, filled, size, label }: SegmentedMeterProps) => {
  const count = clampFilled(filled, total);
  const tone = getMeterTone(filled, total);
  return (
    <Root role="img" aria-label={label} $size={size}>
      {Array.from({ length: Math.max(0, total) }, (_, index) => (
        <Segment key={index} $size={size} $tone={tone} $filled={index < count} />
      ))}
    </Root>
  );
};
