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

import { COPY } from './constants';
import { BrandMark, BrandName, CustomInitial, CustomTitle, Lockup, Names, ProductName, Root } from './styled';
import type { BrandBlockProps } from './types';

export const BrandBlock = ({ collapsed, title = TITLE_CUSTOM }: BrandBlockProps) => {
  if (title) {
    return (
      <Root $collapsed={collapsed}>
        {collapsed ? (
          <CustomInitial role="img" aria-label={title}>
            {title.charAt(0).toUpperCase()}
          </CustomInitial>
        ) : (
          <CustomTitle>{title}</CustomTitle>
        )}
      </Root>
    );
  }

  return (
    <Root $collapsed={collapsed}>
      <Lockup>
        <BrandMark role="img" aria-label={COPY.markAlt} />
        {!collapsed && (
          <Names>
            <BrandName>{COPY.brandName}</BrandName>
            <ProductName>{COPY.productName}</ProductName>
          </Names>
        )}
      </Lockup>
    </Root>
  );
};
