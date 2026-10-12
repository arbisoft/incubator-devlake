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

export const DEFAULT_BRAND_NAME = 'Arbisoft DevLake';
export const POWERED_BY = 'Powered by Apache DevLake';

type BrandEnv = Partial<
  Pick<ImportMetaEnv, 'DEVLAKE_BRAND_NAME' | 'DEVLAKE_TITLE_CUSTOM' | 'DEVLAKE_COLOR_CUSTOM' | 'DEVLAKE_COPYRIGHT_HIDE'>
>;

export const resolveBrand = (env: BrandEnv) => ({
  brandName: env.DEVLAKE_BRAND_NAME || DEFAULT_BRAND_NAME,
  titleCustom: env.DEVLAKE_TITLE_CUSTOM || undefined,
  primaryOverride: env.DEVLAKE_COLOR_CUSTOM || undefined,
  copyrightHide: Boolean(env.DEVLAKE_COPYRIGHT_HIDE),
});

const brand = resolveBrand(import.meta.env);

export const BRAND_NAME = brand.brandName;
export const TITLE_CUSTOM = brand.titleCustom;
export const PRIMARY_OVERRIDE = brand.primaryOverride;
export const COPYRIGHT_HIDE = brand.copyrightHide;
