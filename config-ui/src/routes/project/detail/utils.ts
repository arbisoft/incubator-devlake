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

import { PATHS, PROJECT_TAB, type ProjectTab } from '@/config';

import { COPY } from './constants';
import type { ProjectRouteTab } from './types';

const TAB_ORDER: ProjectTab[] = [
  PROJECT_TAB.BLUEPRINT,
  PROJECT_TAB.WEBHOOKS,
  PROJECT_TAB.CLAUDE_CODE_OTEL,
  PROJECT_TAB.SETTINGS,
];

export const toProjectTab = (key: string | undefined): ProjectTab =>
  TAB_ORDER.find((tab) => tab === key) ?? PROJECT_TAB.BLUEPRINT;

export const getProjectTabs = (pname: string): ProjectRouteTab[] =>
  TAB_ORDER.map((key) => ({ key, label: COPY.tabs[key], path: PATHS.PROJECT_TAB(pname, key) }));
