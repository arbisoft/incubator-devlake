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

import { TITLE_CUSTOM } from '@/config/brand';
import wordmark from '@/images/brand/arbisoft-wordmark.png';
import { MetricTile, METRIC_TILE_TONE, StandalonePage } from '@/ui';

import { COPY } from './constants';
import {
  AsideContent,
  BrandTitle,
  Card,
  Headline,
  Heading,
  Pitch,
  Subtitle,
  Support,
  Tiles,
  Title,
  Wordmark,
} from './styled';
import type { AuthLayoutProps } from './types';

const BrandAside = () => (
  <AsideContent>
    {TITLE_CUSTOM ? <BrandTitle>{TITLE_CUSTOM}</BrandTitle> : <Wordmark src={wordmark} alt={COPY.layout.wordmarkAlt} />}
    <Pitch>
      <Headline>{COPY.layout.headline}</Headline>
      <Support>{COPY.layout.support}</Support>
    </Pitch>
    <Tiles>
      {COPY.layout.tiles.map((tile) => (
        <MetricTile key={tile.label} label={tile.label} value={tile.value} tone={METRIC_TILE_TONE.ON_BRAND} />
      ))}
    </Tiles>
  </AsideContent>
);

export const AuthLayout = ({ title, subtitle, children }: AuthLayoutProps) => (
  <StandalonePage aside={<BrandAside />}>
    <Card>
      <Heading>
        <Title>{title}</Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </Heading>
      {children}
    </Card>
  </StandalonePage>
);
