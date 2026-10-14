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

import type { IConnection } from '@/types';

import { COPY, NEW_CONNECTION_VALUE } from './constants';
import {
  buildConnectionOptions,
  stringifyPlan,
  toConnectionCards,
  toConnectionKey,
  toPlanPayload,
  toScopeConnection,
} from './utils';

const connection = (plugin: string, id: number, name: string) =>
  ({ unique: toConnectionKey(plugin, id), plugin, id, name }) as IConnection;

describe('connection cards', () => {
  it('maps each connection with its scope count and leaves webhooks out', () => {
    expect(
      toConnectionCards([
        { pluginName: 'github', connectionId: 1, scopes: [{ scopeId: 'a' }, { scopeId: 'b' }] },
        { pluginName: 'webhook', connectionId: 9, scopes: [] },
        { pluginName: 'jira', connectionId: 2 },
      ]),
    ).toEqual([
      { key: 'github-1', plugin: 'github', connectionId: 1, scopeCount: 2 },
      { key: 'jira-2', plugin: 'jira', connectionId: 2, scopeCount: 0 },
    ]);
  });
});

describe('add connection options', () => {
  const connections = [connection('github', 1, 'gh'), connection('jira', 2, 'jr')];

  it('starts with the create-new option', () => {
    expect(buildConnectionOptions(connections, [])[0]).toEqual({
      value: NEW_CONNECTION_VALUE,
      label: COPY.addConnection.createNew,
      plugin: '',
    });
  });

  it('lists the connections that are not added yet', () => {
    expect(buildConnectionOptions(connections, ['github-1']).slice(1)).toEqual([
      { value: 'jira-2', label: 'jr', plugin: 'jira' },
    ]);
  });
});

describe('connection payload', () => {
  it('names the plugin, the connection and each chosen scope', () => {
    expect(toScopeConnection(connection('github', 1, 'gh'), ['a', 7])).toEqual({
      pluginName: 'github',
      connectionId: 1,
      scopes: [{ scopeId: 'a' }, { scopeId: 7 }],
    });
  });
});

describe('advanced plan', () => {
  const EMPTY = stringifyPlan([[]]);

  it('saves a valid plan as parsed JSON', () => {
    expect(toPlanPayload('[[{"plugin":"github"}]]')).toEqual([[{ plugin: 'github' }]]);
  });

  it('falls back to the serialised empty plan for an empty or broken one', () => {
    expect(toPlanPayload('[[]]')).toBe(EMPTY);
    expect(toPlanPayload('[]')).toBe(EMPTY);
    expect(toPlanPayload('{ not json')).toBe(EMPTY);
  });

  it('indents the plan by two spaces', () => {
    expect(stringifyPlan([[1]])).toBe('[\n  [\n    1\n  ]\n]');
  });
});
