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

import { buildChangedTestPayload, buildConnectionSavePayload, buildNewTestPayload } from './payload';

describe('plugins/components/connection-form/payload aws fields', () => {
  const awsValues = {
    authType: 'ASSUME_ROLE',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret',
    sessionToken: 'session',
    roleArn: 'arn:aws:iam::123456789012:role/devlake',
    regions: ['us-east-2'],
    useCostExplorer: true,
    externalId: 'never-sent',
  };

  it('saves the aws fields and never the external id', () => {
    expect(buildConnectionSavePayload({}, awsValues)).toStrictEqual({
      authType: 'ASSUME_ROLE',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      sessionToken: 'session',
      roleArn: 'arn:aws:iam::123456789012:role/devlake',
      regions: ['us-east-2'],
      useCostExplorer: true,
    });
  });

  it('tests a new connection with the aws fields and never the external id', () => {
    const payload = buildNewTestPayload({}, awsValues, undefined);

    expect(payload).toMatchObject({ authType: 'ASSUME_ROLE', regions: ['us-east-2'], useCostExplorer: true });
    expect(payload).not.toHaveProperty('externalId');
  });

  it('sends only the aws fields an edit changed', () => {
    const saved = { ...awsValues, secretAccessKey: '' };
    const payload = buildChangedTestPayload(
      saved,
      { ...awsValues, regions: ['eu-west-1'], secretAccessKey: undefined },
      undefined,
    );

    expect(JSON.parse(JSON.stringify(payload))).toStrictEqual({ regions: ['eu-west-1'] });
  });
});
