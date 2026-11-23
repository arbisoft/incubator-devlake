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

import { ACCESS_KEY_SETUP, check } from '../__tests__/fixtures';
import { CHECK_STATUS, COPY } from '../constants';

import { isAwsTestResult, toResultRows } from './rows';

describe('plugins/register/aws/test-result/rows', () => {
  it.each(Object.values(CHECK_STATUS))('keeps one row per check for a region with some access (%s)', (status) => {
    const rows = toResultRows([
      check({ status }),
      check({ action: 'codebuild:ListProjects', status: CHECK_STATUS.ALLOWED }),
    ]);

    expect(rows.map((row) => [row.permission, row.status])).toStrictEqual([
      ['codepipeline:ListPipelines', status],
      ['codebuild:ListProjects', CHECK_STATUS.ALLOWED],
    ]);
  });

  it.each([CHECK_STATUS.DENIED, CHECK_STATUS.NOT_CHECKED])('collapses a region where every check is %s', (status) => {
    const rows = toResultRows([
      check({ status, detail: 'first reason' }),
      check({ action: 'codebuild:ListProjects', status, detail: 'second reason' }),
    ]);

    expect(rows).toStrictEqual([
      {
        key: 'region:us-east-2',
        permission: COPY.testResult.noAccess('us-east-2', 'first reason'),
        region: 'us-east-2',
        status,
        detail: '',
      },
    ]);
  });

  it('marks a collapsed region denied when any check was denied', () => {
    const rows = toResultRows([
      check({ status: CHECK_STATUS.NOT_CHECKED }),
      check({ action: 'codebuild:ListProjects', status: CHECK_STATUS.DENIED }),
    ]);

    expect(rows.map((row) => row.status)).toStrictEqual([CHECK_STATUS.DENIED]);
  });

  it('collapses each region on its own and keeps the others expanded', () => {
    const rows = toResultRows([
      check({ region: 'us-east-2', status: CHECK_STATUS.DENIED }),
      check({ region: 'eu-west-1', status: CHECK_STATUS.ALLOWED }),
      check({ region: 'us-east-2', action: 'codebuild:ListProjects', status: CHECK_STATUS.DENIED }),
    ]);

    expect(rows.map((row) => row.key)).toStrictEqual(['region:us-east-2', 'eu-west-1:codepipeline:ListPipelines']);
  });

  it('shows a dash for a check without a region and never collapses it', () => {
    const rows = toResultRows([check({ region: undefined, action: 'sts:AssumeRole', status: CHECK_STATUS.DENIED })]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ permission: 'sts:AssumeRole', region: COPY.emptyCell });
  });

  it('does not change the checks it is given', () => {
    const checks = [check({ status: CHECK_STATUS.DENIED })];
    const before = structuredClone(checks);

    toResultRows(checks);

    expect(checks).toStrictEqual(before);
  });

  it('recognises a response that carries checks', () => {
    expect(isAwsTestResult({ success: true, message: '', ...{ checks: [] } })).toBe(true);
    expect(isAwsTestResult({ success: true, message: '' })).toBe(false);
    expect(isAwsTestResult({ success: true, message: '', ...ACCESS_KEY_SETUP })).toBe(false);
  });
});
