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

import { groupBy } from 'lodash';

import type { IConnectionTestResult } from '@/types';

import { CHECK_STATUS, COPY } from '../constants';
import type { AwsPermissionCheck, AwsTestResult, ResultRow } from '../types';

export const isAwsTestResult = (result: IConnectionTestResult): result is AwsTestResult =>
  'checks' in result && Array.isArray(result.checks);

const hasNoAccess = (check: AwsPermissionCheck) =>
  check.status === CHECK_STATUS.DENIED || check.status === CHECK_STATUS.NOT_CHECKED;

const toCheckRow = (check: AwsPermissionCheck): ResultRow => ({
  key: `${check.region ?? ''}:${check.action}`,
  permission: check.action,
  region: check.region || COPY.emptyCell,
  requirement: check.requirement,
  status: check.status,
  detail: check.detail ?? '',
});

const toRegionRow = (region: string, checks: AwsPermissionCheck[]): ResultRow => ({
  key: `region:${region}`,
  permission: COPY.testResult.noAccess(region, checks.find((check) => check.detail)?.detail ?? ''),
  region,
  status: checks.some((check) => check.status === CHECK_STATUS.DENIED) ? CHECK_STATUS.DENIED : CHECK_STATUS.NOT_CHECKED,
  detail: '',
});

// A region where every check is denied or not checked collapses into one summary row.
export const toResultRows = (checks: AwsPermissionCheck[]): ResultRow[] => {
  const byRegion = groupBy(
    checks.filter((check) => check.region),
    (check) => check.region,
  );
  const noAccess = new Set(
    Object.entries(byRegion)
      .filter(([, group]) => group.every(hasNoAccess))
      .map(([region]) => region),
  );
  const emitted = new Set<string>();

  return checks.flatMap((check) => {
    const region = check.region ?? '';
    if (!noAccess.has(region)) return [toCheckRow(check)];
    if (emitted.has(region)) return [];
    emitted.add(region);
    return [toRegionRow(region, byRegion[region] ?? [])];
  });
};
