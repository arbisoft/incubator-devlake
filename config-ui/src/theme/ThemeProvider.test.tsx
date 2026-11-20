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

import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setMode, themeSlice } from '@/features/theme/slice';

import { THEME_MODE } from './constants';
import { ThemeProvider } from './ThemeProvider';

const stubSystemPreference = (initialDark: boolean) => {
  let matches = initialDark;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return (dark: boolean) => {
    matches = dark;
    listeners.forEach((listener) => listener());
  };
};

const renderProvider = (mode: (typeof THEME_MODE)[keyof typeof THEME_MODE]) => {
  const store = configureStore({ reducer: { theme: themeSlice.reducer } });
  store.dispatch(setMode(mode));
  render(
    <Provider store={store as never}>
      <ThemeProvider>
        <div />
      </ThemeProvider>
    </Provider>,
  );
  return store;
};

const currentTheme = () => document.documentElement.dataset.theme;

describe('ThemeProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('resolves the light mode to the light theme', () => {
    stubSystemPreference(true);
    renderProvider(THEME_MODE.LIGHT);
    expect(currentTheme()).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('resolves the dark mode to the dark theme', () => {
    stubSystemPreference(false);
    renderProvider(THEME_MODE.DARK);
    expect(currentTheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('follows the system preference in system mode and updates when it changes', () => {
    const setSystemDark = stubSystemPreference(false);
    renderProvider(THEME_MODE.SYSTEM);
    expect(currentTheme()).toBe('light');

    act(() => setSystemDark(true));
    expect(currentTheme()).toBe('dark');

    act(() => setSystemDark(false));
    expect(currentTheme()).toBe('light');
  });

  it('ignores system preference changes once a fixed mode is chosen', () => {
    const setSystemDark = stubSystemPreference(false);
    const store = renderProvider(THEME_MODE.SYSTEM);

    act(() => {
      store.dispatch(setMode(THEME_MODE.LIGHT));
    });
    act(() => setSystemDark(true));
    expect(currentTheme()).toBe('light');
  });
});
