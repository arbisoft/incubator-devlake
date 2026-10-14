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

import type { BlueprintConnectionPayload } from '@/types/blueprint';

import { COPY } from './constants';
import {
  getBreadcrumbs,
  getDetailRoutes,
  getScopeIds,
  getTargetLabel,
  parseUnique,
  replaceScopes,
  sliceRows,
  withoutConnection,
} from './utils';

const REF = { plugin: 'github', connectionId: 3 };
const CONNECTIONS: BlueprintConnectionPayload[] = [
  { pluginName: 'github', connectionId: 3, scopes: [{ scopeId: 'a' }, { scopeId: 'b' }] },
  { pluginName: 'github', connectionId: 4, scopes: [{ scopeId: 'c' }] },
  { pluginName: 'jira', connectionId: 3 },
];

describe('connection unique', () => {
  it('splits the plugin from the numeric connection id', () => {
    expect(parseUnique('github-3')).toEqual(REF);
  });

  it('keeps a hyphen inside the plugin name', () => {
    expect(parseUnique('my-plugin-12')).toEqual({ plugin: 'my-plugin', connectionId: 12 });
  });
});

describe('blueprint connections', () => {
  it('reads the scope ids of the connection, and none when it is missing', () => {
    expect(getScopeIds(CONNECTIONS, REF)).toEqual(['a', 'b']);
    expect(getScopeIds(CONNECTIONS, { plugin: 'jira', connectionId: 3 })).toEqual([]);
    expect(getScopeIds(CONNECTIONS, { plugin: 'gitlab', connectionId: 1 })).toEqual([]);
  });

  it('replaces the scopes of that connection only', () => {
    expect(replaceScopes(CONNECTIONS, REF, ['x'])).toEqual([
      { pluginName: 'github', connectionId: 3, scopes: [{ scopeId: 'x' }] },
      CONNECTIONS[1],
      CONNECTIONS[2],
    ]);
  });

  it('removes that connection only', () => {
    expect(withoutConnection(CONNECTIONS, REF)).toEqual([CONNECTIONS[1], CONNECTIONS[2]]);
  });
});

describe('back navigation', () => {
  it('goes back to the Configurations view of a project blueprint by URL', () => {
    expect(getDetailRoutes({ pname: 'my project', blueprintId: 7 }, REF)).toEqual({
      status: '/projects/my%20project/blueprint',
      configuration: '/projects/my%20project/blueprint/configuration',
      connection: '/connections/github/3',
    });
  });

  it('goes back to the Configurations view of an advanced blueprint by URL', () => {
    expect(getDetailRoutes({ blueprintId: 7 }, REF)).toEqual({
      status: '/advanced/blueprints/7',
      configuration: '/advanced/blueprints/7/configuration',
      connection: '/connections/github/3',
    });
  });

  it('ends the project breadcrumb on the page itself, after the Configurations link', () => {
    const scope = { pname: 'edly', blueprintId: 7 };
    const crumbs = getBreadcrumbs(scope, getDetailRoutes(scope, REF));
    expect(crumbs.map(({ label }) => label)).toEqual([
      COPY.breadcrumbs.projects,
      'edly',
      COPY.breadcrumbs.blueprint,
      COPY.breadcrumbs.configurations,
      COPY.breadcrumbs.editScope,
    ]);
    expect(crumbs[3].path).toBe('/projects/edly/blueprint/configuration');
    expect(crumbs[4].path).toBeUndefined();
  });

  it('starts the advanced breadcrumb at Advanced', () => {
    const scope = { blueprintId: 7 };
    const crumbs = getBreadcrumbs(scope, getDetailRoutes(scope, REF));
    expect(crumbs.map(({ label }) => label).slice(0, 3)).toEqual(['Advanced', 'Blueprints', '7']);
    expect(crumbs[3].path).toBe('/advanced/blueprints/7/configuration');
  });
});

describe('confirm wording', () => {
  it('names the project or the blueprint the connection belongs to', () => {
    expect(getTargetLabel('edly', 'bp')).toBe(COPY.target.project('edly'));
    expect(getTargetLabel(undefined, 'bp')).toBe(COPY.target.advanced('bp'));
  });
});

describe('scope pages', () => {
  const rows = [1, 2, 3, 4, 5];

  it('slices the rows of one page', () => {
    expect(sliceRows(rows, 1, 2)).toEqual([1, 2]);
    expect(sliceRows(rows, 3, 2)).toEqual([5]);
    expect(sliceRows(rows, 4, 2)).toEqual([]);
  });
});
