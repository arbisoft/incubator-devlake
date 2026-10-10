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

import type { IPluginConfig } from '@/types';

import { deprecationStorageKey, pickDeprecatedPlugin } from './utils';

const plugin = (id: string, message?: string): IPluginConfig =>
  ({ plugin: id, isDeprecated: Boolean(message), deprecationMessage: message }) as IPluginConfig;

const AZURE_MESSAGE = 'old plugin';
const AZURE_ID = 'azuredevops';
const AZURE = plugin(AZURE_ID, AZURE_MESSAGE);
const OTHER = plugin('other', 'also old');
const CURRENT = plugin('github');

describe('pickDeprecatedPlugin', () => {
  it('returns nothing without connections on the deprecated plugin', () => {
    expect(pickDeprecatedPlugin([AZURE, CURRENT], [], {})).toBeUndefined();
    expect(pickDeprecatedPlugin([AZURE, CURRENT], [{ plugin: 'github' }], {})).toBeUndefined();
  });

  it('returns the deprecated plugin that has a connection', () => {
    expect(pickDeprecatedPlugin([AZURE, CURRENT], [{ plugin: AZURE_ID }], {})).toBe(AZURE);
  });

  it('returns nothing when the same message was dismissed', () => {
    expect(pickDeprecatedPlugin([AZURE], [{ plugin: AZURE_ID }], { [AZURE_ID]: AZURE_MESSAGE })).toBeUndefined();
  });

  it('shows again when the message changed since the dismissal', () => {
    expect(pickDeprecatedPlugin([AZURE], [{ plugin: AZURE_ID }], { [AZURE_ID]: 'older text' })).toBe(AZURE);
  });

  it('picks the other plugin when the first one is dismissed', () => {
    const connections = [{ plugin: AZURE_ID }, { plugin: 'other' }];
    expect(pickDeprecatedPlugin([AZURE, OTHER], connections, { [AZURE_ID]: AZURE_MESSAGE })).toBe(OTHER);
  });

  it('skips unknown plugin configs', () => {
    expect(pickDeprecatedPlugin([undefined, AZURE], [{ plugin: AZURE_ID }], {})).toBe(AZURE);
  });
});

describe('deprecationStorageKey', () => {
  it('is scoped by plugin', () => {
    expect(deprecationStorageKey('azuredevops')).toBe('devlake.pluginDeprecationDismissed.azuredevops');
  });
});
