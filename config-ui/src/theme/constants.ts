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

import type { ThemeMode } from './tokens';

export const THEME_MODE = { LIGHT: 'light', DARK: 'dark', SYSTEM: 'system' } as const satisfies Record<
  string,
  ThemeMode
>;

export const THEME_MODES: ThemeMode[] = [THEME_MODE.LIGHT, THEME_MODE.DARK, THEME_MODE.SYSTEM];

export const THEME_STORAGE_KEY = 'devlake.theme';
