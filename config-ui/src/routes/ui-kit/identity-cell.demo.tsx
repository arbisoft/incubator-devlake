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

import { IdentityCell, STATUS_BADGE_VARIANT, STATUS_TONE, StatusBadge } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { IDENTITY, IDENTITY_LONG, IDENTITY_TAG } from './fixtures';
import { Narrow } from './styled';

export const IdentityCellDemo = () => (
  <DemoSection id={SECTION.IDENTITY_CELL} title={COPY.sections.identityCell}>
    <DemoCase label={COPY.cases.default}>
      <IdentityCell {...IDENTITY} />
    </DemoCase>
    <DemoCase label={COPY.cases.withAdornment}>
      <IdentityCell
        {...IDENTITY}
        adornment={<StatusBadge tone={STATUS_TONE.INFO} label={IDENTITY_TAG} variant={STATUS_BADGE_VARIANT.TEXT} />}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.empty}>
      <IdentityCell primary={IDENTITY.primary} />
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <IdentityCell {...IDENTITY_LONG} />
      </Narrow>
    </DemoCase>
  </DemoSection>
);
