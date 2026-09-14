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

import { Typography } from 'antd';

import type { AiSourcePreference } from '@/api/otel';
import { OTEL_CANONICAL_SOURCE } from './constants';
import { SourceCard } from './styled';

type CanonicalSourceCardProps = {
  preferences: AiSourcePreference[];
};

export const CanonicalSourceCard = ({ preferences }: CanonicalSourceCardProps) => {
  const organizationCount = new Set(preferences.map((preference) => preference.workspaceKey)).size;
  return (
    <SourceCard size="small" title={OTEL_CANONICAL_SOURCE.TITLE}>
      <Typography.Paragraph>{OTEL_CANONICAL_SOURCE.DESCRIPTION}</Typography.Paragraph>
      {organizationCount > 0 && (
        <Typography.Text type="secondary">
          Active for {organizationCount} Anthropic {organizationCount === 1 ? 'organization' : 'organizations'}.
        </Typography.Text>
      )}
    </SourceCard>
  );
};
