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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import { RootState } from '@/app/store';
import { THEME_MODE, THEME_STORAGE_KEY } from '@/theme/constants';
import type { ThemeMode, ResolvedTheme } from '@/theme/tokens';

import type { ThemeState } from './types';

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === THEME_MODE.LIGHT || value === THEME_MODE.DARK || value === THEME_MODE.SYSTEM;

const loadInitialMode = (): ThemeMode => {
  if (typeof window === 'undefined') return THEME_MODE.SYSTEM;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // localStorage may be unavailable (e.g., SSR / privacy mode)
  }
  return THEME_MODE.SYSTEM;
};

const persistMode = (mode: ThemeMode): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable (e.g., SSR / privacy mode)
  }
};

const initialState: ThemeState = {
  mode: loadInitialMode(),
};

export const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      persistMode(action.payload);
    },
  },
});

export const { setMode } = themeSlice.actions;

export const selectThemeMode = (state: RootState): ThemeMode => state.theme.mode;

export const resolveThemeMode = (mode: ThemeMode): ResolvedTheme => {
  if (mode !== THEME_MODE.SYSTEM) return mode;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return THEME_MODE.LIGHT;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_MODE.DARK : THEME_MODE.LIGHT;
};
