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

import { toCheckedProjectRefs, toProjectRefs, toRelatedProjects } from './utils';

describe('toRelatedProjects', () => {
  it('keeps each project with the scopes it uses', () => {
    expect(toRelatedProjects([{ name: 'p1', scopes: [{ scopeName: 'repo' }] }, { name: 'p2' }])).toEqual([
      { name: 'p1', scopes: [{ scopeName: 'repo' }] },
      { name: 'p2', scopes: [] },
    ]);
  });

  it('is empty without a check result', () => {
    expect(toRelatedProjects(undefined)).toEqual([]);
  });
});

describe('toProjectRefs', () => {
  it('names each project by its blueprint', () => {
    expect(toProjectRefs([{ id: 3, projectName: 'p1' }])).toEqual([{ name: 'p1', blueprintId: 3 }]);
    expect(toProjectRefs(undefined)).toEqual([]);
  });
});

describe('toCheckedProjectRefs', () => {
  it('keeps only the name and blueprint of each checked project', () => {
    expect(toCheckedProjectRefs([{ name: 'p1', blueprintId: 4 }])).toEqual([{ name: 'p1', blueprintId: 4 }]);
    expect(toCheckedProjectRefs(undefined)).toEqual([]);
  });
});
