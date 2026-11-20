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

import { ConfigProvider } from 'antd';
import { ReactNode, useEffect, useMemo, useSyncExternalStore } from 'react';
import { ThemeProvider as StyledThemeProvider } from 'styled-components';

import { PRIMARY_OVERRIDE } from '@/config/brand';
import { PREFERS_DARK_QUERY, selectThemeMode, resolveThemeMode } from '@/features/theme/slice';
import { useAppSelector } from '@/hooks';

import { THEME_MODE } from './constants';
import { getTheme, ResolvedTheme } from './tokens';

interface Props {
  children: ReactNode;
}

const cssVarMap: Record<string, keyof ReturnType<typeof getTheme>['colors']> = {
  '--devlake-color-text': 'text',
  '--devlake-color-text-secondary': 'textSecondary',
  '--devlake-color-text-muted': 'textTertiary',
  '--devlake-color-text-body': 'textBody',
  '--devlake-color-text-subdued': 'textMuted',
  '--devlake-color-bg': 'bgContainer',
  '--devlake-color-bg-elevated': 'bgElevated',
  '--devlake-color-border': 'border',
  '--devlake-color-success': 'success',
  '--devlake-color-error': 'error',
  '--devlake-color-error-alt': 'errorAlt',
  '--devlake-color-warning': 'warning',
  '--devlake-color-warning-alt': 'warningAlt',
  '--devlake-color-warning-soft': 'warningSoft',
};

const subscribeSystemTheme = (onChange: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const media = window.matchMedia(PREFERS_DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const readSystemTheme = () => resolveThemeMode(THEME_MODE.SYSTEM);

export const ThemeProvider = ({ children }: Props) => {
  const mode = useAppSelector(selectThemeMode);
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, readSystemTheme, () => THEME_MODE.LIGHT);
  const resolved: ResolvedTheme = mode === THEME_MODE.SYSTEM ? systemTheme : mode;

  const theme = useMemo(() => getTheme(resolved, PRIMARY_OVERRIDE), [resolved]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    for (const [cssVar, key] of Object.entries(cssVarMap)) {
      root.style.setProperty(cssVar, theme.colors[key]);
    }
  }, [resolved, theme]);

  return (
    <ConfigProvider theme={theme.antd}>
      <StyledThemeProvider theme={theme}>{children}</StyledThemeProvider>
    </ConfigProvider>
  );
};
