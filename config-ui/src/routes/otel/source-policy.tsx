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

import { Descriptions, Flex, Typography } from 'antd';

import { type AiSourcePreference } from '@/api/otel';
import { OTEL_SOURCE_POLICY } from './constants';

type OtelSourcePolicyProps = {
  preferences?: AiSourcePreference[];
};

export const OtelSourcePolicy = ({ preferences }: OtelSourcePolicyProps) => {
  const active = preferences?.filter((preference) => preference.preferredSource === 'otel') ?? [];

  return (
    <Flex vertical gap={8} style={{ marginBottom: 16 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        {OTEL_SOURCE_POLICY.TITLE}
      </Typography.Title>
      {active.length > 0 && (
        <Descriptions bordered size="small" column={{ xs: 1, sm: 3 }}>
          {active.map((preference) => (
            <Descriptions.Item
              key={`${preference.workspaceKey}-${preference.metricFamily}`}
              label={preference.metricFamily}
            >
              {preference.preferredSource}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
    </Flex>
  );
};
