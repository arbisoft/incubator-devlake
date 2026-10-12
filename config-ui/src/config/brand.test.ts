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

import { describe, expect, it } from 'vitest';

import {
  BRAND_NAME,
  COPYRIGHT_HIDE,
  DEFAULT_BRAND_NAME,
  POWERED_BY,
  PRIMARY_OVERRIDE,
  resolveBrand,
  TITLE_CUSTOM,
} from './brand';

describe('brand', () => {
  it('falls back to the defaults when no env is set', () => {
    expect(resolveBrand({})).toEqual({
      brandName: DEFAULT_BRAND_NAME,
      titleCustom: undefined,
      primaryOverride: undefined,
      copyrightHide: false,
    });
  });

  it('applies every env override', () => {
    expect(
      resolveBrand({
        DEVLAKE_BRAND_NAME: 'Acme Lake',
        DEVLAKE_TITLE_CUSTOM: 'Acme',
        DEVLAKE_COLOR_CUSTOM: 'brand-override',
        DEVLAKE_COPYRIGHT_HIDE: true,
      }),
    ).toEqual({ brandName: 'Acme Lake', titleCustom: 'Acme', primaryOverride: 'brand-override', copyrightHide: true });
  });

  it('treats empty env values as unset', () => {
    const brand = resolveBrand({ DEVLAKE_BRAND_NAME: '', DEVLAKE_TITLE_CUSTOM: '', DEVLAKE_COLOR_CUSTOM: '' });
    expect(brand.brandName).toBe(DEFAULT_BRAND_NAME);
    expect(brand.titleCustom).toBeUndefined();
    expect(brand.primaryOverride).toBeUndefined();
  });

  it('exports the resolved constants for the current env', () => {
    const brand = resolveBrand(import.meta.env);
    expect([BRAND_NAME, TITLE_CUSTOM, PRIMARY_OVERRIDE, COPYRIGHT_HIDE]).toEqual([
      brand.brandName,
      brand.titleCustom,
      brand.primaryOverride,
      brand.copyrightHide,
    ]);
  });

  it('keeps the Apache attribution fixed', () => {
    expect(POWERED_BY).toBe('Powered by Apache DevLake');
  });
});
