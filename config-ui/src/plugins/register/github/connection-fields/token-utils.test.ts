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

import { isMaskedGithubToken } from './token-utils';

describe('plugins/register/github/connection-fields/token-utils', () => {
  it('detects masked GitHub tokens returned by the API', () => {
    expect(isMaskedGithubToken('ghp_example********************Suffix12')).toBe(true);
    expect(
      isMaskedGithubToken(
        'github_pat_example******************************************************************Suffix12',
      ),
    ).toBe(true);
  });

  it('does not treat real GitHub tokens as masked placeholders', () => {
    expect(isMaskedGithubToken('ghp_exampleTokenWithoutMaskCharacters12345')).toBe(false);
    expect(isMaskedGithubToken('')).toBe(false);
    expect(isMaskedGithubToken(undefined)).toBe(false);
  });
});
