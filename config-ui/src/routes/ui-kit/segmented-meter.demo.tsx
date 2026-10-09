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

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Row } from './styled';

const TOTAL = 3;
const TONES = [
  { label: COPY.segmentedMeter.tone.none, filled: 0 },
  { label: COPY.segmentedMeter.tone.partial, filled: 2 },
  { label: COPY.segmentedMeter.tone.complete, filled: TOTAL },
];
const SIZES = Object.values(METER_SIZE);

export const SegmentedMeterDemo = () => (
  <DemoSection id={SECTION.SEGMENTED_METER} title={COPY.sections.segmentedMeter}>
    {TONES.map(({ label, filled }) => (
      <DemoCase key={label} label={label}>
        <Row>
          {SIZES.map((size) => (
            <SegmentedMeter
              key={size}
              total={TOTAL}
              filled={filled}
              size={size}
              label={COPY.segmentedMeter.label(filled, TOTAL)}
            />
          ))}
        </Row>
      </DemoCase>
    ))}
  </DemoSection>
);
