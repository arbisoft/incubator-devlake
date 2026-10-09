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

import { useCallback, useState } from 'react';

import { LAYOUT } from '@/theme/scales';
import { STORAGE_KEYS } from '@/ui/constants';

const readStored = (): boolean | undefined => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
    return stored === null ? undefined : stored === 'true';
  } catch {
    return undefined;
  }
};

const writeStored = (collapsed: boolean) => {
  try {
    window.localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(collapsed));
  } catch {
    // storage may be blocked; the preference then lasts for the session only
  }
};

export const useSidebarCollapsed = () => {
  const [collapsed, setState] = useState(() => readStored() ?? window.innerWidth < LAYOUT.breakpointTablet);

  const setCollapsed = useCallback((next: boolean) => {
    setState(next);
    writeStored(next);
  }, []);

  return [collapsed, setCollapsed] as const;
};
