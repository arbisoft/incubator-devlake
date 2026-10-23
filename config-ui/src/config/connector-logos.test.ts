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

import { CONNECTOR_BRAND_COLORS } from '@/theme';
import { CONNECTOR_LOGO_KIND } from '@/ui/plugin-icon';

import { CONNECTOR_LOGO_KEYS, getConnectorLogo } from './connector-logos';

const EXPECTED_KINDS: Record<string, string> = {
  github: 'mono',
  gitlab: 'logo',
  bitbucket: 'logo',
  bitbucket_server: 'logo',
  azuredevops: 'logo',
  azuredevops_go: 'logo',
  jira: 'logo',
  jenkins: 'logo',
  pagerduty: 'logo',
  circleci: 'mono',
  claude_code: 'logo',
  claude_otel: 'logo',
  webhook: 'mono',
  argocd: 'logo',
  grafana_irm: 'logo',
  youtrack: 'logo',
  clickup: 'logo',
  slack: 'logo',
  incidentio: 'logo',
  plane: 'logo',
  cursor: 'logo',
  asana: 'tint',
  hubspot: 'tint',
  linear: 'tint',
  bamboo: 'tint',
  sonarqube: 'tint',
  codex: 'mono',
  notion: 'mono',
  opsgenie: 'mono',
  'gh-copilot': 'mono',
};

describe('getConnectorLogo', () => {
  it('covers exactly the registered keys', () => {
    expect([...CONNECTOR_LOGO_KEYS].sort()).toEqual(Object.keys(EXPECTED_KINDS).sort());
  });

  it('returns undefined for an unknown plugin', () => {
    expect(getConnectorLogo('not-a-plugin')).toBeUndefined();
  });

  it.each(Object.entries(EXPECTED_KINDS))('maps %s to the %s kind', (plugin, kind) => {
    expect(getConnectorLogo(plugin)?.kind).toBe(kind);
  });

  it('draws every tint colour from the brand colours', () => {
    CONNECTOR_LOGO_KEYS.forEach((plugin) => {
      const logo = getConnectorLogo(plugin);
      if (logo?.kind === CONNECTOR_LOGO_KIND.TINT) expect(Object.values(CONNECTOR_BRAND_COLORS)).toContain(logo.color);
    });
  });
});
