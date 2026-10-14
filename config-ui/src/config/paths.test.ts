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

import { PATHS, ROUTE_SEGMENTS } from './paths';
import { BLUEPRINT_VIEW, PROJECT_TAB } from './route-keys';

describe('PATHS', () => {
  it('builds the settings paths', () => {
    expect(PATHS.SETTINGS_USERS()).toBe('/settings/users');
    expect(PATHS.SETTINGS_AUTHENTICATION()).toBe('/settings/authentication');
    expect(PATHS.SETTINGS_ACTIVITY()).toBe('/settings/activity');
  });

  it('builds project paths and encodes the name', () => {
    expect(PATHS.PROJECT_TAB('a b', PROJECT_TAB.WEBHOOKS)).toBe('/projects/a%20b/webhooks');
    expect(PATHS.PROJECT_BLUEPRINT_VIEW('a/b', BLUEPRINT_VIEW.CONFIGURATION)).toBe(
      '/projects/a%2Fb/blueprint/configuration',
    );
    expect(PATHS.PROJECT_BLUEPRINT_CONNECTION('demo', 'github-1')).toBe(
      '/projects/demo/blueprint/connections/github-1',
    );
    expect(PATHS.PROJECT_CONNECTION('demo', 'github', 1)).toBe('/projects/demo/blueprint/connections/github-1');
  });

  it('builds blueprint and pipeline paths', () => {
    expect(PATHS.BLUEPRINT_VIEW(7, BLUEPRINT_VIEW.STATUS)).toBe('/advanced/blueprints/7/status');
    expect(PATHS.BLUEPRINT_CONNECTION(7, 'github', 1)).toBe('/advanced/blueprints/7/connections/github-1');
    expect(PATHS.PIPELINE(9)).toBe('/advanced/pipeline/9');
  });

  it('builds the fixed paths', () => {
    expect(PATHS.ONBOARD()).toBe('/onboard');
    expect(PATHS.DB_MIGRATE()).toBe('/db-migrate');
    expect(PATHS.DASHBOARDS()).toBe('/api/access/grafana-login');
  });

  it('keeps the project tab keys and the tab route segments in step', () => {
    expect(Object.values(PROJECT_TAB)).toEqual(['blueprint', 'webhooks', 'claude-code-otel', 'settings']);
    expect(ROUTE_SEGMENTS.PROJECT_TAB(PROJECT_TAB.SETTINGS)).toBe('projects/:pname/settings');
  });

  it('keeps the blueprint view route segments in step with the view paths', () => {
    expect(ROUTE_SEGMENTS.PROJECT_BLUEPRINT_VIEW(BLUEPRINT_VIEW.CONFIGURATION)).toBe(
      'projects/:pname/blueprint/configuration',
    );
    expect(ROUTE_SEGMENTS.BLUEPRINT_VIEW(BLUEPRINT_VIEW.CONFIGURATION)).toBe('blueprints/:id/configuration');
  });
});
