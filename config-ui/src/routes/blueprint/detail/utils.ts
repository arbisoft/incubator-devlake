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

import { BLUEPRINT_VIEW, type BlueprintView, PATHS, PROJECT_TAB } from '@/config';
import type { IBlueprint } from '@/types';
import { toRouteTabs, toTabKey } from '@/ui/utils';
import { formatTime } from '@/utils';

import { getNextRunTime } from '../sync-policy';

import { BLUEPRINT_CONTEXT, BLUEPRINT_VIEW_ORDER, COPY, NEXT_RUN_FORMAT } from './constants';
import type { BlueprintContext, BlueprintViewPaths } from './types';

const getBlueprintViews = (paths: BlueprintViewPaths) => toRouteTabs(BLUEPRINT_VIEW_ORDER, COPY.views, paths);

export const toBlueprintView = (key: string | undefined): BlueprintView =>
  toTabKey(BLUEPRINT_VIEW_ORDER, key, BLUEPRINT_VIEW.STATUS);

export const getProjectBlueprintViews = (pname: string) =>
  getBlueprintViews({
    [BLUEPRINT_VIEW.STATUS]: PATHS.PROJECT_TAB(pname, PROJECT_TAB.BLUEPRINT),
    [BLUEPRINT_VIEW.CONFIGURATION]: PATHS.PROJECT_BLUEPRINT_VIEW(pname, BLUEPRINT_VIEW.CONFIGURATION),
  });

export const getAdvancedBlueprintViews = (id: ID) =>
  getBlueprintViews({
    [BLUEPRINT_VIEW.STATUS]: PATHS.BLUEPRINT(id),
    [BLUEPRINT_VIEW.CONFIGURATION]: PATHS.BLUEPRINT_VIEW(id, BLUEPRINT_VIEW.CONFIGURATION),
  });

export const getNextRunLabel = (isManual: boolean, cronConfig: string) =>
  isManual
    ? COPY.actions.manual
    : COPY.actions.nextRun(formatTime(getNextRunTime(isManual, cronConfig), NEXT_RUN_FORMAT));

type ContextRoutes = {
  status: (blueprint: IBlueprint) => string;
  connection: (blueprint: IBlueprint, plugin: string, connectionId: ID) => string;
};

export const CONTEXT_ROUTES: Record<BlueprintContext, ContextRoutes> = {
  [BLUEPRINT_CONTEXT.PROJECT]: {
    status: ({ projectName }) => PATHS.PROJECT_TAB(projectName, PROJECT_TAB.BLUEPRINT),
    connection: ({ projectName }, plugin, connectionId) => PATHS.PROJECT_CONNECTION(projectName, plugin, connectionId),
  },
  [BLUEPRINT_CONTEXT.ADVANCED]: {
    status: ({ id }) => PATHS.BLUEPRINT(id),
    connection: ({ id }, plugin, connectionId) => PATHS.BLUEPRINT_CONNECTION(id, plugin, connectionId),
  },
};
