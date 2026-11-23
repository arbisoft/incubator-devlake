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

import type { AwsSetupResponse } from '@/api/plugin/aws';

import { CHECK_STATUS } from '../constants';
import type { AwsPermissionCheck, AwsTestResult } from '../types';

const POLICY_VERSION = '2012-10-17';

export const EXTERNAL_ID = 'e2e-external-id-0001';

const PERMISSIONS = [
  { action: 'codepipeline:ListPipelines', requirement: 'required', usedFor: 'Lists pipelines for the scope picker.' },
  { action: 'logs:GetLogEvents', requirement: 'optional', usedFor: 'Reads build log signals.' },
];

export const ASSUME_ROLE_SETUP: AwsSetupResponse = {
  externalId: EXTERNAL_ID,
  brokerArn: 'arn:aws:iam::111111111111:user/broker',
  brokerArnResolved: true,
  trustPolicy: { Version: POLICY_VERSION, Statement: [{ Sid: 'TrustBroker', Effect: 'Allow' }] },
  brokerPolicy: { Version: POLICY_VERSION, Statement: [{ Sid: 'AssumeRole', Effect: 'Allow' }] },
  permissionPolicy: { Version: POLICY_VERSION, Statement: [{ Sid: 'ReadPipelines', Effect: 'Allow' }] },
  permissions: PERMISSIONS,
};

export const ACCESS_KEY_SETUP: AwsSetupResponse = {
  permissionPolicy: ASSUME_ROLE_SETUP.permissionPolicy,
  permissions: PERMISSIONS,
};

export const check = (overrides: Partial<AwsPermissionCheck>): AwsPermissionCheck => ({
  action: 'codepipeline:ListPipelines',
  usedFor: 'Lists pipelines',
  region: 'us-east-2',
  requirement: 'required',
  status: CHECK_STATUS.ALLOWED,
  ...overrides,
});

export const PASSING_RESULT: AwsTestResult = {
  success: true,
  message: 'Connected to account 123456789012',
  accountId: '123456789012',
  checks: [
    check({}),
    check({
      action: 'logs:GetLogEvents',
      requirement: 'optional',
      status: CHECK_STATUS.DENIED,
      detail: 'AccessDenied',
    }),
  ],
  warnings: ['Build log signals are off: logs:GetLogEvents is denied in us-east-2.'],
};

export const FAILING_RESULT: AwsTestResult = {
  success: false,
  message: 'Check failed: codepipeline:ListPipelines in us-east-2',
  checks: [
    check({ status: CHECK_STATUS.NOT_CHECKED, detail: 'credentials failed' }),
    check({ action: 'codebuild:ListProjects', status: CHECK_STATUS.NOT_CHECKED, detail: 'credentials failed' }),
  ],
};
