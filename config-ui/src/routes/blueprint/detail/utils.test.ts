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

import { describe, expect, it } from 'vitest';

import { BLUEPRINT_VIEW } from '@/config';
import type { IBlueprint } from '@/types';

import { BLUEPRINT_CONTEXT, COPY, STATUS_ACTION, STATUS_ACTIONS } from './constants';
import {
  CONTEXT_ROUTES,
  getAdvancedBlueprintViews,
  getNextRunLabel,
  getProjectBlueprintViews,
  toBlueprintView,
} from './utils';

describe('blueprint views', () => {
  it('lists Status first, on the bare route, and Configurations on its own route, for a project', () => {
    expect(getProjectBlueprintViews('my project')).toEqual([
      { key: BLUEPRINT_VIEW.STATUS, label: COPY.views.status, path: '/projects/my%20project/blueprint' },
      {
        key: BLUEPRINT_VIEW.CONFIGURATION,
        label: COPY.views.configuration,
        path: '/projects/my%20project/blueprint/configuration',
      },
    ]);
  });

  it('lists the same two views for an advanced blueprint', () => {
    expect(getAdvancedBlueprintViews(7).map(({ key, path }) => [key, path])).toEqual([
      [BLUEPRINT_VIEW.STATUS, '/advanced/blueprints/7'],
      [BLUEPRINT_VIEW.CONFIGURATION, '/advanced/blueprints/7/configuration'],
    ]);
  });

  it('shows every view, whichever page lists it', () => {
    const views = [...getProjectBlueprintViews('a'), ...getAdvancedBlueprintViews(1)];
    expect(views.every(({ visible }) => visible !== false)).toBe(true);
  });

  it('falls back to Status for an unknown or missing view', () => {
    expect(toBlueprintView(BLUEPRINT_VIEW.CONFIGURATION)).toBe(BLUEPRINT_VIEW.CONFIGURATION);
    expect(toBlueprintView('other')).toBe(BLUEPRINT_VIEW.STATUS);
    expect(toBlueprintView(undefined)).toBe(BLUEPRINT_VIEW.STATUS);
  });
});

describe('getNextRunLabel', () => {
  it('says Manual for a manual blueprint', () => {
    expect(getNextRunLabel(true, '0 0 * * *')).toBe(COPY.actions.manual);
  });

  it('shows the next run time for a scheduled blueprint', () => {
    expect(getNextRunLabel(false, '0 0 * * *')).toMatch(/^Next run: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('shows a dash when the schedule cannot be read', () => {
    expect(getNextRunLabel(false, 'not a cron')).toBe(COPY.actions.nextRun('-'));
  });
});

describe('status actions per context', () => {
  it('gives a project the run controls and a more menu', () => {
    expect(STATUS_ACTIONS[BLUEPRINT_CONTEXT.PROJECT]).toEqual([
      STATUS_ACTION.NEXT_RUN,
      STATUS_ACTION.RE_TRANSFORM,
      STATUS_ACTION.COLLECT,
      STATUS_ACTION.MORE,
    ]);
  });

  it('gives an advanced blueprint run now, the enabled switch and delete', () => {
    expect([...STATUS_ACTIONS[BLUEPRINT_CONTEXT.ADVANCED]].sort()).toEqual(
      [STATUS_ACTION.RUN_NOW, STATUS_ACTION.ENABLED, STATUS_ACTION.DELETE].sort(),
    );
  });
});

describe('context routes', () => {
  const blueprint = { id: 4, projectName: 'demo' } as IBlueprint;

  it('links a project blueprint back to its own tab and connection pages', () => {
    const routes = CONTEXT_ROUTES[BLUEPRINT_CONTEXT.PROJECT];
    expect(routes.status(blueprint)).toBe('/projects/demo/blueprint');
    expect(routes.connection(blueprint, 'github', 2)).toBe('/projects/demo/blueprint/connections/github-2');
  });

  it('links an advanced blueprint to the advanced pages even when a project owns it', () => {
    const routes = CONTEXT_ROUTES[BLUEPRINT_CONTEXT.ADVANCED];
    expect(routes.status(blueprint)).toBe('/advanced/blueprints/4');
    expect(routes.connection(blueprint, 'github', 2)).toBe('/advanced/blueprints/4/connections/github-2');
  });
});
