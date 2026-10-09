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
export const INTEGRATION_CATEGORY = {
  CODE_SCM: 'Code & SCM',
  CI_CD: 'CI/CD & Automation',
  ISSUES: 'Issue & Project Tracking',
  AI_ANALYTICS: 'AI & Analytics',
  CUSTOM: 'Custom & Webhooks',
} as const;

export type IntegrationCategory = (typeof INTEGRATION_CATEGORY)[keyof typeof INTEGRATION_CATEGORY];

export type CatalogEntry = { category: IntegrationCategory; weight: number; beta?: boolean };

export const DEFAULT_CATALOG_ENTRY: CatalogEntry = { category: INTEGRATION_CATEGORY.CUSTOM, weight: 1000 };

const { CODE_SCM, CI_CD, ISSUES, AI_ANALYTICS, CUSTOM } = INTEGRATION_CATEGORY;

export const PLUGIN_CATALOG: Record<string, CatalogEntry> = {
  github: { category: CODE_SCM, weight: 10 },
  gitlab: { category: CODE_SCM, weight: 20 },
  bitbucket: { category: CODE_SCM, weight: 30 },
  bitbucket_server: { category: CODE_SCM, weight: 40 },
  azuredevops: { category: CODE_SCM, weight: 50 },
  azuredevops_go: { category: CODE_SCM, weight: 60 },
  sonarqube: { category: CODE_SCM, weight: 70 },
  jenkins: { category: CI_CD, weight: 110 },
  circleci: { category: CI_CD, weight: 120 },
  bamboo: { category: CI_CD, weight: 130 },
  argocd: { category: CI_CD, weight: 140 },
  testmo: { category: CI_CD, weight: 150 },
  jira: { category: ISSUES, weight: 210 },
  linear: { category: ISSUES, weight: 220 },
  asana: { category: ISSUES, weight: 230 },
  clickup: { category: ISSUES, weight: 240 },
  plane: { category: ISSUES, weight: 250 },
  youtrack: { category: ISSUES, weight: 260 },
  zentao: { category: ISSUES, weight: 270 },
  tapd: { category: ISSUES, weight: 280 },
  teambition: { category: ISSUES, weight: 290 },
  notion: { category: ISSUES, weight: 300 },
  pagerduty: { category: ISSUES, weight: 310 },
  opsgenie: { category: ISSUES, weight: 320 },
  incidentio: { category: ISSUES, weight: 330 },
  rootly: { category: ISSUES, weight: 340 },
  grafana_irm: { category: ISSUES, weight: 350 },
  tempo: { category: ISSUES, weight: 360 },
  claude_code: { category: AI_ANALYTICS, weight: 410 },
  'gh-copilot': { category: AI_ANALYTICS, weight: 430 },
  cursor: { category: AI_ANALYTICS, weight: 440 },
  codex: { category: AI_ANALYTICS, weight: 450 },
  kiro: { category: AI_ANALYTICS, weight: 460 },
  q_dev: { category: AI_ANALYTICS, weight: 470 },
  webhook: { category: CUSTOM, weight: 510 },
  slack: { category: CUSTOM, weight: 520 },
  salesforce: { category: CUSTOM, weight: 530 },
  hubspot: { category: CUSTOM, weight: 540 },
};

export const getCatalogEntry = (config: { plugin: string; isBeta?: boolean }): CatalogEntry & { beta: boolean } => {
  const entry = PLUGIN_CATALOG[config.plugin] ?? DEFAULT_CATALOG_ENTRY;
  return { ...entry, beta: entry.beta ?? config.isBeta ?? false };
};
