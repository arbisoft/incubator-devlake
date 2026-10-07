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

import { NO_SCOPE_CONFIG } from './constants';
import { toScopeConfigRows } from './utils';

const CONFIGS = [
  { id: 1, name: 'one' },
  { id: 2, name: 'two' },
];

describe('toScopeConfigRows', () => {
  it('is empty until the configs load', () => {
    expect(toScopeConfigRows(undefined, true)).toEqual([]);
  });

  it('lists the configs as they are', () => {
    expect(toScopeConfigRows(CONFIGS, false)).toEqual(CONFIGS);
  });

  it('puts a "no scope config" row first when a config is already associated', () => {
    expect(toScopeConfigRows(CONFIGS, true)).toEqual([{ ...NO_SCOPE_CONFIG }, ...CONFIGS]);
  });
});
