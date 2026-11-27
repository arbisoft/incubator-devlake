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

import { APIRequestContext, Page } from '@playwright/test';

import { loginAsAdmin } from '../auth-helpers';
import { test, expect } from '../fixtures';
import {
  adminApi,
  createConnection,
  deleteConnectionsByPrefix,
  findConnectionByName,
  getConnection,
  putAwsPipelineScope,
  uniqueName,
} from '../support/api';
import {
  AWS_AUTH_TYPE,
  AWS_COPY,
  AWS_DEFAULT_PATTERNS,
  AWS_TRANSFORMATION_FIELDS,
  CONNECTION_FORM_COPY,
} from '../support/app-copy';
import { awsStoredSecretLength } from '../support/db';
import { AwsConnectionForm, AwsScopeConfigForm } from '../support/pages/aws-connection';
import { ConnectionDetailPage, ConnectionsPage, PLUGINS } from '../support/pages/connections';

const FAKE_ACCESS_KEY_ID = 'AKIAE2EFAKEKEY000001';
const FAKE_SECRET = 'e2e-fake-secret-access-key-000000000000';
const FAKE_ROLE_ARN = 'arn:aws:iam::123456789012:role/e2e-devlake';
const REGION = 'us-east-2';

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await adminApi(playwright);
});

test.afterAll(async () => {
  await deleteConnectionsByPrefix(api, PLUGINS.aws.key);
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await loginAsAdmin(context);
});

const openCreate = async (page: Page) => {
  const form = await new ConnectionsPage(page).openCreateForm(PLUGINS.aws);
  return new AwsConnectionForm(page, form.dialog);
};

test.describe.serial('AWS connection through the UI', () => {
  const assumeRoleName = uniqueName('aws-role');
  let assumeRoleId = 0;
  let externalId = '';

  test('create an access-key connection', async ({ page }) => {
    const name = uniqueName('aws-key');
    const aws = await openCreate(page);
    await aws.fillName(name);
    await aws.chooseAuthType(AWS_AUTH_TYPE.ACCESS_KEY);
    await aws.fillAccessKey(AWS_AUTH_TYPE.ACCESS_KEY, FAKE_ACCESS_KEY_ID, FAKE_SECRET);
    await aws.addRegion(REGION);
    await aws.save();
    await expect(page).toHaveURL(new ConnectionDetailPage(page, PLUGINS.aws).urlPattern);

    const saved = await findConnectionByName(api, PLUGINS.aws.key, name);
    expect(saved).toMatchObject({ authType: 'ACCESS_KEY', regions: [REGION] });
    expect(saved?.secretAccessKey).toBe('');
    expect(JSON.stringify(saved)).not.toContain(FAKE_SECRET);
  });

  test('create an assume-role connection and see its External ID', async ({ page }) => {
    const aws = await openCreate(page);
    await expect(aws.saveFirstNotice).toBeVisible();
    await aws.fillName(assumeRoleName);
    await aws.fillAccessKey(AWS_AUTH_TYPE.ASSUME_ROLE, FAKE_ACCESS_KEY_ID, FAKE_SECRET);
    await aws.addRegion(REGION);
    await aws.save();
    const detail = new ConnectionDetailPage(page, PLUGINS.aws);
    await expect(page).toHaveURL(detail.urlPattern);
    assumeRoleId = detail.idFromUrl();

    const saved = await getConnection(api, PLUGINS.aws.key, assumeRoleId);
    expect(saved).toMatchObject({ authType: 'ASSUME_ROLE', roleArn: '' });
    externalId = String(saved?.externalId);
    expect(externalId).not.toBe('');

    const connections = new ConnectionsPage(page);
    await connections.open();
    await connections.openCard(PLUGINS.aws.name);
    const form = await connections.openEditForm(PLUGINS.aws, assumeRoleId, assumeRoleName);
    const edit = new AwsConnectionForm(page, form.dialog);
    await expect(edit.externalIdHeading).toBeVisible();
    await expect(edit.externalIdCode(externalId)).toBeVisible();
    await expect(edit.copyButton(AWS_COPY.setup.externalId.copy)).toBeVisible();
    await expect(edit.trustPolicyCode(externalId)).toBeVisible();
  });

  test('rename the assume-role connection and keep the External ID and the broker secret', async ({ page }) => {
    const renamed = `${assumeRoleName}-renamed`;
    const secretLength = awsStoredSecretLength(assumeRoleId);
    expect(secretLength).toBeGreaterThan(0);

    const connections = new ConnectionsPage(page);
    await connections.open();
    await connections.openCard(PLUGINS.aws.name);
    const form = await connections.openEditForm(PLUGINS.aws, assumeRoleId, assumeRoleName);
    const edit = new AwsConnectionForm(page, form.dialog);
    await edit.fillRoleArn(FAKE_ROLE_ARN);
    await edit.fillName(renamed);
    await edit.save();
    await expect(connections.toast(CONNECTION_FORM_COPY.save.updated)).toBeVisible();

    const saved = await getConnection(api, PLUGINS.aws.key, assumeRoleId);
    expect(saved).toMatchObject({ name: renamed, roleArn: FAKE_ROLE_ARN, externalId });
    expect(awsStoredSecretLength(assumeRoleId)).toBeGreaterThan(0);
  });

  test('testing an access-key connection with fake credentials shows the result and blocks Save', async ({ page }) => {
    const aws = await openCreate(page);
    await aws.fillName(uniqueName('aws-test'));
    await aws.chooseAuthType(AWS_AUTH_TYPE.ACCESS_KEY);
    await aws.fillAccessKey(AWS_AUTH_TYPE.ACCESS_KEY, FAKE_ACCESS_KEY_ID, FAKE_SECRET);
    await aws.addRegion(REGION);

    expect(await aws.testAndGetStatus()).toBe(200);

    await expect(aws.resultCell(AWS_COPY.testResult.noAccess(REGION, 'credentials failed'))).toBeVisible();
    await expect(aws.resultCell(AWS_COPY.testResult.status.not_checked)).toBeVisible();
    await expect(aws.saveButton).toBeDisabled();

    await aws.addRegion('us-west-2');
    await expect(aws.saveButton).toBeEnabled();
    await expect(aws.resultTable).toBeHidden();
  });
});

test('the scope config form shows the five default patterns and saves them', async ({ page }) => {
  const connection = await createConnection(api, PLUGINS.aws.key, {
    name: uniqueName('aws-scope'),
    authType: 'ACCESS_KEY',
    accessKeyId: FAKE_ACCESS_KEY_ID,
    secretAccessKey: FAKE_SECRET,
    regions: [REGION],
    rateLimitPerHour: 10000,
  });
  const scopeName = uniqueName('aws-pipeline');
  await putAwsPipelineScope(api, connection.id, {
    arn: `arn:aws:codepipeline:${REGION}:123456789012:${scopeName}`,
    name: scopeName,
    region: REGION,
  });
  const configName = uniqueName('aws-scope-config');

  const detail = new ConnectionDetailPage(page, PLUGINS.aws);
  await detail.open(connection.id);
  await detail.openAssociateScopeConfig(scopeName);
  const form = new AwsScopeConfigForm(page);
  await form.openCreate();
  await form.fillName(configName);
  await form.next();
  for (const { key, label } of AWS_TRANSFORMATION_FIELDS) {
    await expect(form.pattern(label)).toHaveValue(AWS_DEFAULT_PATTERNS[key]);
  }
  await form.save();
  await expect(detail.associateScopeConfigRow(configName)).toBeVisible();

  const res = await api.get(`/plugins/aws/connections/${connection.id}/scope-configs`);
  const configs: Record<string, unknown>[] = await res.json();
  expect(configs.find((c) => c.name === configName)).toMatchObject(AWS_DEFAULT_PATTERNS);
});
