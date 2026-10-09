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

import { BLUEPRINT_VIEW } from '@/config/route-keys';
import type { BlueprintView } from '@/config/types';
import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';
import type { ConfirmConfig } from '@/ui/types';

export const BLUEPRINT_CONTEXT = { PROJECT: 'project', ADVANCED: 'advanced' } as const;

export const BLUEPRINT_VIEW_ORDER: BlueprintView[] = [BLUEPRINT_VIEW.STATUS, BLUEPRINT_VIEW.CONFIGURATION];

export const STATUS_ACTION = {
  NEXT_RUN: 'nextRun',
  RE_TRANSFORM: 'reTransform',
  COLLECT: 'collect',
  MORE: 'more',
  RUN_NOW: 'runNow',
  ENABLED: 'enabled',
  DELETE: 'delete',
} as const;

export const STATUS_ACTIONS: Record<
  (typeof BLUEPRINT_CONTEXT)[keyof typeof BLUEPRINT_CONTEXT],
  (typeof STATUS_ACTION)[keyof typeof STATUS_ACTION][]
> = {
  [BLUEPRINT_CONTEXT.PROJECT]: [
    STATUS_ACTION.NEXT_RUN,
    STATUS_ACTION.RE_TRANSFORM,
    STATUS_ACTION.COLLECT,
    STATUS_ACTION.MORE,
  ],
  [BLUEPRINT_CONTEXT.ADVANCED]: [STATUS_ACTION.ENABLED, STATUS_ACTION.DELETE, STATUS_ACTION.RUN_NOW],
};

export const CONFIRM_KIND = { FULL_REFRESH: 'fullRefresh', DELETE: 'delete' } as const;

export const MORE_MENU_KEY = { FULL_REFRESH: 'fullRefresh' } as const;

export const HISTORY_PAGE_SIZE = 10;
export const NEXT_RUN_FORMAT = 'YYYY-MM-DD HH:mm';
const HTTP_BAD_REQUEST = '400';

export const COPY = {
  views: {
    [BLUEPRINT_VIEW.STATUS]: 'Status',
    [BLUEPRINT_VIEW.CONFIGURATION]: 'Configurations',
  } satisfies Record<BlueprintView, string>,
  viewsLabel: 'Blueprint views',
  notFound: (id: string | number) => `Blueprint not found with id: ${id}`,
  panels: {
    current: 'Current pipeline',
    historical: 'Historical pipelines',
    toggle: (title: string, expanded: boolean) => (expanded ? `Collapse ${title}` : `Expand ${title}`),
  },
  actions: {
    manual: 'Manual',
    nextRun: (time: string) => `Next run: ${time}`,
    reTransform: 'Re-transform data',
    reTransformHint:
      'It is recommended to re-transform your data in this project if you have updated the transformation of the data scope in this project.',
    collect: 'Collect data',
    more: 'More actions',
    fullRefresh: 'Collect data in full refresh mode',
    runNow: 'Run now',
    enabled: 'Blueprint enabled',
    delete: 'Delete blueprint',
  },
  empty: {
    current: 'There is no current run for this blueprint.',
    historical: 'There are no historical runs associated with this blueprint.',
  },
  messages: {
    triggered: 'Trigger blueprint successful.',
    updated: 'Update blueprint successful.',
    deleted: 'Delete blueprint successful.',
  },
  errors: {
    notRunnable: 'This blueprint cannot run right now. Make sure it is enabled and has data connections.',
    run: 'The blueprint could not be run. Try again in a moment.',
    update: 'The blueprint could not be updated. Try again in a moment.',
    remove:
      'The blueprint could not be deleted. It may still have unfinished pipelines; wait for them to finish and try again.',
  },
};

export const RUN_ERROR_MAP: Record<string, string> = { [HTTP_BAD_REQUEST]: COPY.errors.notRunnable };

export const CONFIRM: Record<(typeof CONFIRM_KIND)[keyof typeof CONFIRM_KIND], ConfirmConfig> = {
  [CONFIRM_KIND.FULL_REFRESH]: {
    tone: CONFIRM_TONE.DEFAULT,
    title: () => COPY.actions.fullRefresh,
    description: () =>
      'This operation may take a long time as it will empty all of your existing data and re-collect it.',
    confirm: COPY.actions.runNow,
  },
  [CONFIRM_KIND.DELETE]: {
    tone: CONFIRM_TONE.DANGER,
    title: (name) => `Delete blueprint ${name}?`,
    description: () =>
      'Please note: deleting the Blueprint will not delete the historical data of the Data Scopes in this Blueprint. If you would like to delete the historical data of Data Scopes, please visit the Connection page and do so.',
    confirm: COPY.actions.delete,
  },
};
