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

import type { ConnectionFieldRenderProps, IPluginConfig } from '@/types';

import Icon from './assets/icon.svg?react';
import {
  AuthTypeSection,
  CostExplorerSection,
  CredentialsSection,
  RegionsSection,
  SetupSection,
} from './connection-fields';
import { DEFAULT_PATTERNS, DEFAULT_RATE_LIMIT, AWS_AUTH_TYPE, COPY } from './constants';
import { SectionGap } from './styled';
import { renderAwsTestResult } from './test-result';
import type { AwsConnectionValues } from './types';

type RenderProps = ConnectionFieldRenderProps<AwsConnectionValues>;

const sections = [AuthTypeSection, CredentialsSection, RegionsSection, CostExplorerSection, SetupSection];

export const AwsConfig: IPluginConfig = {
  plugin: 'aws',
  name: COPY.pluginName,
  icon: ({ color }) => <Icon fill={color} />,
  sort: 8.5,
  connection: {
    docLink: '',
    initialValues: {
      authType: AWS_AUTH_TYPE.ASSUME_ROLE,
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: '',
      roleArn: '',
      regions: [],
      useCostExplorer: false,
      rateLimitPerHour: DEFAULT_RATE_LIMIT,
    },
    fields: [
      'name',
      ...sections.map(
        (Section) =>
          function AwsSection(props: RenderProps) {
            return (
              <SectionGap>
                <Section {...props} />
              </SectionGap>
            );
          },
      ),
      { key: 'rateLimitPerHour', subLabel: COPY.rateLimit, defaultValue: DEFAULT_RATE_LIMIT },
    ],
    renderTestResult: renderAwsTestResult,
  },
  dataScope: {
    title: COPY.dataScopeTitle,
  },
  scopeConfig: {
    entities: ['CICD'],
    transformation: { ...DEFAULT_PATTERNS },
  },
};
