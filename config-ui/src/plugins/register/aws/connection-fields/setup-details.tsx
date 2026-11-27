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

import { Alert } from 'antd';

import type { AwsSetupResponse } from '@/api/plugin/aws';
import { CODE_LANGUAGE, CodeBlock, SectionCard } from '@/ui';

import { COPY } from '../constants';
import { BlockTitle, Help, Stack } from '../styled';

import { PermissionsTable } from './permissions-table';

const BLOCKS = [
  { key: 'externalId', copy: COPY.setup.externalId, language: CODE_LANGUAGE.SHELL, singleLine: true },
  { key: 'trustPolicy', copy: COPY.setup.trustPolicy, language: CODE_LANGUAGE.JSON, singleLine: false },
  { key: 'brokerPolicy', copy: COPY.setup.brokerPolicy, language: CODE_LANGUAGE.JSON, singleLine: false },
  { key: 'permissionPolicy', copy: COPY.setup.permissionPolicy, language: CODE_LANGUAGE.JSON, singleLine: false },
] as const;

// Only assume-role connections get a trust policy, so its presence tells the two setups apart.
export const SetupDetails = ({ setup }: { setup: AwsSetupResponse }) => {
  const heading = setup.trustPolicy === undefined ? COPY.setup.heading.accessKey : COPY.setup.heading.assumeRole;
  return (
    <SectionCard title={heading.title} description={heading.description}>
      <Stack>
        {setup.brokerArnResolved === false && <Alert type="warning" showIcon title={COPY.setup.brokerPlaceholder} />}
        {BLOCKS.map(({ key, copy, language, singleLine }) =>
          setup[key] === undefined ? null : (
            <Stack key={key}>
              <BlockTitle>{copy.label}</BlockTitle>
              <Help>{copy.help}</Help>
              <CodeBlock value={setup[key]} language={language} copyLabel={copy.copy} singleLine={singleLine} />
            </Stack>
          ),
        )}
        <BlockTitle>{COPY.setup.permissions.title}</BlockTitle>
        <PermissionsTable rows={setup.permissions} />
      </Stack>
    </SectionCard>
  );
};
