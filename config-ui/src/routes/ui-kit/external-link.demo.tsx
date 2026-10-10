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

import { ExternalLink } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { DOCS_HREF } from './fixtures';
import { Narrow } from './styled';

const HREF = DOCS_HREF;

export const ExternalLinkDemo = () => (
  <DemoSection id={SECTION.EXTERNAL_LINK} title={COPY.sections.externalLink}>
    <DemoCase label={COPY.cases.default}>
      <ExternalLink href={HREF}>{COPY.externalLink.docs}</ExternalLink>
    </DemoCase>
    <DemoCase label={COPY.cases.withIcon}>
      <ExternalLink href={HREF} showIcon>
        {COPY.externalLink.docs}
      </ExternalLink>
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <ExternalLink href={HREF} showIcon>
          {COPY.externalLink.long}
        </ExternalLink>
      </Narrow>
    </DemoCase>
  </DemoSection>
);
