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

import { METRIC_TILE_TONE, MetricTile } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { METRIC_LONG_VALUE, METRIC_TIME } from './fixtures';
import { BrandBackdrop, Framed, Narrow, TopRow } from './styled';

const { metricTile: text } = COPY;

export const MetricTileDemo = () => (
  <DemoSection id={SECTION.METRIC_TILE} title={COPY.sections.metricTile}>
    <DemoCase label={COPY.cases.metricsBar}>
      <Framed>
        <TopRow>
          <MetricTile label={text.label} value={6} />
          <MetricTile label={text.failed} value={1} hint={text.hint} />
          <MetricTile {...METRIC_TIME} />
        </TopRow>
      </Framed>
    </DemoCase>
    <DemoCase label={COPY.cases.onBrand}>
      <BrandBackdrop>
        <MetricTile label={text.onBrandLabel} value={text.onBrandValue} tone={METRIC_TILE_TONE.ON_BRAND} />
      </BrandBackdrop>
    </DemoCase>
    <DemoCase label={COPY.cases.overflow}>
      <Narrow>
        <MetricTile label={text.longLabel} value={METRIC_LONG_VALUE} />
      </Narrow>
    </DemoCase>
  </DemoSection>
);
