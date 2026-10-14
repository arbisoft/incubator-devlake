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

import { POWERED_BY, TITLE_CUSTOM } from '@/config/brand';
import wordmark from '@/images/brand/arbisoft-wordmark.png';
import Mark from '@/images/brand/devlake-mark.svg?react';

import { COPY } from './constants';
import { CustomInitial, CustomTitle, MarkTile, PoweredBy, Root, Wordmark } from './styled';
import type { BrandBlockProps } from './types';

export const BrandBlock = ({ collapsed, title = TITLE_CUSTOM }: BrandBlockProps) => {
  if (title) {
    return collapsed ? (
      <Root $collapsed>
        <MarkTile>
          <CustomInitial role="img" aria-label={title}>
            {title.charAt(0).toUpperCase()}
          </CustomInitial>
        </MarkTile>
      </Root>
    ) : (
      <Root $collapsed={false}>
        <CustomTitle>{title}</CustomTitle>
      </Root>
    );
  }

  return collapsed ? (
    <Root $collapsed>
      <MarkTile>
        <Mark role="img" aria-label={COPY.markAlt} />
      </MarkTile>
    </Root>
  ) : (
    <Root $collapsed={false}>
      <Wordmark src={wordmark} alt={COPY.wordmarkAlt} />
      <PoweredBy>{POWERED_BY}</PoweredBy>
    </Root>
  );
};
