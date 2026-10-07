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

import { isDetailsValid, toCopyName, toTransformation } from './utils';

describe('isDetailsValid', () => {
  it('needs a name and at least one entity', () => {
    expect(isDetailsValid('shared', ['CODE'])).toBe(true);
    expect(isDetailsValid('', ['CODE'])).toBe(false);
    expect(isDetailsValid('shared', [])).toBe(false);
  });
});

describe('toTransformation', () => {
  it('drops the record fields and keeps the transformation fields', () => {
    const config = {
      id: 1,
      connectionId: 2,
      name: 'cfg',
      entities: ['CODE'],
      createdAt: 'then',
      updatedAt: 'now',
      issueTypeBug: '(bug)',
      refdiff: { tagsLimit: 10 },
    };
    expect(toTransformation(config)).toEqual({ issueTypeBug: '(bug)', refdiff: { tagsLimit: 10 } });
  });
});

describe('toCopyName', () => {
  it('suffixes a duplicate and leaves an edit alone', () => {
    expect(toCopyName('cfg', true)).toBe('cfg-copy');
    expect(toCopyName('cfg', false)).toBe('cfg');
  });
});
