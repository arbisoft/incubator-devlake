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

import { STATUS_BADGE_VARIANT, StatusBadge, STATUS_TONE } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { TONE_LABELS } from './fixtures';
import { Narrow, Row } from './styled';

const TONES = Object.values(STATUS_TONE);

export const StatusBadgeDemo = () => (
  <DemoSection id={SECTION.STATUS_BADGE} title={COPY.sections.statusBadge}>
    {Object.values(STATUS_BADGE_VARIANT).map((variant) => (
      <DemoCase
        key={variant}
        label={variant === STATUS_BADGE_VARIANT.DOT ? COPY.statusBadge.dot : COPY.statusBadge.text}
      >
        <Row>
          {TONES.map((tone) => (
            <StatusBadge key={tone} tone={tone} label={TONE_LABELS[tone]} variant={variant} />
          ))}
        </Row>
      </DemoCase>
    ))}
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <StatusBadge tone={STATUS_TONE.WARNING} label={COPY.statusBadge.longLabel} variant={STATUS_BADGE_VARIANT.DOT} />
      </Narrow>
    </DemoCase>
  </DemoSection>
);
