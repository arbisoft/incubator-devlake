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

import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_MODE, THEME_MODES, THEME_STORAGE_KEY } from '@/theme/constants';

import { resolveThemeMode, themeSlice } from './slice';

describe('themeSlice', () => {
  afterEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it.each(THEME_MODES)('persists the %s mode', (mode) => {
    themeSlice.reducer(undefined, themeSlice.actions.setMode(mode));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(mode);
  });

  it('resolves the system preference from matchMedia', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    expect(resolveThemeMode(THEME_MODE.SYSTEM)).toBe(THEME_MODE.DARK);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    expect(resolveThemeMode(THEME_MODE.SYSTEM)).toBe(THEME_MODE.LIGHT);
  });
});
