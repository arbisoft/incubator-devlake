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

import { listFilterProps, toListFilterPatch } from './list-filter';

const OPTIONS = [
  { text: 'A', value: 'a' },
  { text: 'B', value: 'b' },
];

describe('listFilterProps', () => {
  it.each([
    ['undefined', undefined, null],
    ['empty string', '', null],
    ['empty array', [], null],
    ['a string', 'a', ['a']],
    ['an array', ['a', 'b'], ['a', 'b']],
  ])('maps %s to filteredValue', (_, value, expected) => {
    expect(listFilterProps(value, OPTIONS).filteredValue).toEqual(expected);
  });

  it('keeps the same filteredValue reference for an unchanged URL value', () => {
    const urlValue = ['github:1'];
    expect(listFilterProps(urlValue, []).filteredValue).toBe(listFilterProps(urlValue, []).filteredValue);
    expect(listFilterProps('enabled', []).filteredValue).toBe(listFilterProps('enabled', []).filteredValue);
  });

  it('defaults to multiple without search and passes the options through', () => {
    expect(listFilterProps([], OPTIONS)).toMatchObject({ filters: OPTIONS, filterMultiple: true, filterSearch: false });
  });

  it('honours multiple and search', () => {
    expect(listFilterProps('a', OPTIONS, { multiple: false, search: true })).toMatchObject({
      filterMultiple: false,
      filterSearch: true,
    });
  });
});

describe('toListFilterPatch', () => {
  type F = { tags: string[]; status: string };
  const columns = {
    tagsCol: { name: 'tags' as const, multiple: true },
    statusCol: { name: 'status' as const, multiple: false },
  };

  it.each([
    ['null and empty become undefined', { tagsCol: null, statusCol: [] }, { tags: undefined, status: undefined }],
    [
      'multiple keeps every value, single keeps the first',
      { tagsCol: ['a', 'b'], statusCol: ['x', 'y'] },
      { tags: ['a', 'b'], status: 'x' },
    ],
    ['a missing column becomes undefined', {}, { tags: undefined, status: undefined }],
  ])('%s', (_, filters, expected) => {
    expect(toListFilterPatch<F>(filters, columns)).toStrictEqual(expected);
  });
});
