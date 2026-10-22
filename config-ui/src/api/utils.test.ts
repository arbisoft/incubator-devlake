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

import { toSearchParams } from './utils';

describe('toSearchParams', () => {
  it('repeats array items and stringifies scalars', () => {
    expect(toSearchParams({ page: 1, enable: false, connection: ['a:1', 'b:2'] }).toString()).toBe(
      'page=1&enable=false&connection=a%3A1&connection=b%3A2',
    );
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['an empty array', []],
  ])('skips %s', (_, value) => {
    expect(toSearchParams({ keyword: value, page: 1 }).toString()).toBe('page=1');
  });
});
