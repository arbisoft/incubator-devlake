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

import { getTaskName } from './task-name';

const ZENTAO = 'ZenTao';
const REFDIFF = 'RefDiff';
const AZURE = 'Azure DevOps';

describe('getTaskName', () => {
  it.each([
    ['github', 'GitHub', { name: 'org/repo' }, 'GitHub:org/repo'],
    ['gitlab', 'GitLab', { projectId: 12 }, 'GitLab:12'],
    ['jira', 'Jira', { boardId: 4 }, 'Jira:4'],
    ['zentao', ZENTAO, { projectId: 9 }, 'ZenTao:project/9'],
    ['zentao', ZENTAO, { productId: 3 }, 'ZenTao:product/3'],
    ['refdiff', REFDIFF, { repoId: 'r1', projectName: 'p' }, 'RefDiff:r1'],
    ['refdiff', REFDIFF, { projectName: 'p' }, 'RefDiff:p'],
    ['azuredevops_go', AZURE, { name: 'team/repo' }, 'ado:team/repo'],
  ])('labels %s tasks by what they collect', (plugin, base, options, expected) => {
    expect(getTaskName(plugin, base, options)).toBe(expected);
  });

  it('falls back to the plugin name when the option is missing or the plugin has no label', () => {
    expect(getTaskName('github', 'GitHub', {})).toBe('GitHub');
    expect(getTaskName('org', 'Org', { name: 'x' })).toBe('Org');
    expect(getTaskName('azuredevops_go', AZURE)).toBe(AZURE);
  });
});
