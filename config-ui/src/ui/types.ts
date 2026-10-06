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

import type { ReactNode } from 'react';

import type { ICON_SIZE_PX, MODAL_WIDTH, NAV_ITEM_KIND, SORT_ORDER, STATUS_TONE } from './constants';

export type StatusTone = (typeof STATUS_TONE)[keyof typeof STATUS_TONE];
export type SortOrder = (typeof SORT_ORDER)[keyof typeof SORT_ORDER];
export type SortState<S extends string = string> = { sortBy: S; sortOrder: SortOrder };
export type IconSize = keyof typeof ICON_SIZE_PX;

export type RouteTab = { key: string; label: string; path: string; visible?: boolean };

export type Crumb = { label: string; path?: string };
export type ModalWidth = (typeof MODAL_WIDTH)[keyof typeof MODAL_WIDTH];

export type NavItem =
  | {
      kind: typeof NAV_ITEM_KIND.ROUTE;
      key: string;
      label: string;
      icon: ReactNode;
      path: string;
      matchPaths?: string[];
      children?: NavItem[];
      visible?: boolean;
    }
  | {
      kind: typeof NAV_ITEM_KIND.EXTERNAL;
      key: string;
      label: string;
      icon: ReactNode;
      href: string;
      visible?: boolean;
    }
  | { kind: typeof NAV_ITEM_KIND.DIVIDER; key: string };
