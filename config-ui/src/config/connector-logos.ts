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

import ArgocdLogo from '@/images/connector-logos/argocd.svg?react';
import AzureLogo from '@/images/connector-logos/azure.svg?react';
import BambooLogo from '@/images/connector-logos/bamboo.svg?react';
import BitbucketLogo from '@/images/connector-logos/bitbucket.svg?react';
import CircleciLogo from '@/images/connector-logos/circleci.svg?react';
import ClaudeLogo from '@/images/connector-logos/claude.svg?react';
import ClickupLogo from '@/images/connector-logos/clickup.svg?react';
import CursorLogo from '@/images/connector-logos/cursor.svg?react';
import GhCopilotLogo from '@/images/connector-logos/gh-copilot.svg?react';
import GithubLogo from '@/images/connector-logos/github.svg?react';
import GitlabLogo from '@/images/connector-logos/gitlab.svg?react';
import GrafanaIrmLogo from '@/images/connector-logos/grafana-irm.svg?react';
import IncidentioLogo from '@/images/connector-logos/incidentio.svg?react';
import JenkinsLogo from '@/images/connector-logos/jenkins.svg?react';
import JiraLogo from '@/images/connector-logos/jira.svg?react';
import OpsgenieLogo from '@/images/connector-logos/opsgenie.svg?react';
import PagerdutyLogo from '@/images/connector-logos/pagerduty.svg?react';
import PlaneLogo from '@/images/connector-logos/plane.svg?react';
import SlackLogo from '@/images/connector-logos/slack.svg?react';
import SonarqubeLogo from '@/images/connector-logos/sonarqube.svg?react';
import WebhookLogo from '@/images/connector-logos/webhook.svg?react';
import YoutrackLogo from '@/images/connector-logos/youtrack.svg?react';
import { CONNECTOR_BRAND_COLORS } from '@/theme';
import { CONNECTOR_LOGO_KIND, type ConnectorLogo } from '@/ui/plugin-icon';

const { LOGO, MONO, TINT } = CONNECTOR_LOGO_KIND;

const CONNECTOR_LOGOS: Record<string, ConnectorLogo> = {
  github: { Svg: GithubLogo, kind: MONO },
  gitlab: { Svg: GitlabLogo, kind: LOGO },
  bitbucket: { Svg: BitbucketLogo, kind: LOGO },
  bitbucket_server: { Svg: BitbucketLogo, kind: LOGO },
  azuredevops: { Svg: AzureLogo, kind: LOGO },
  jira: { Svg: JiraLogo, kind: LOGO },
  jenkins: { Svg: JenkinsLogo, kind: LOGO },
  pagerduty: { Svg: PagerdutyLogo, kind: LOGO },
  circleci: { Svg: CircleciLogo, kind: MONO },
  claude_code: { Svg: ClaudeLogo, kind: LOGO },
  claude_otel: { Svg: ClaudeLogo, kind: LOGO },
  webhook: { Svg: WebhookLogo, kind: MONO },
  argocd: { Svg: ArgocdLogo, kind: LOGO },
  grafana_irm: { Svg: GrafanaIrmLogo, kind: LOGO },
  youtrack: { Svg: YoutrackLogo, kind: LOGO },
  clickup: { Svg: ClickupLogo, kind: LOGO },
  slack: { Svg: SlackLogo, kind: LOGO },
  azuredevops_go: { Svg: AzureLogo, kind: LOGO },
  incidentio: { Svg: IncidentioLogo, kind: LOGO },
  asana: { color: CONNECTOR_BRAND_COLORS.asana, kind: TINT },
  hubspot: { color: CONNECTOR_BRAND_COLORS.hubspot, kind: TINT },
  linear: { color: CONNECTOR_BRAND_COLORS.linear, kind: TINT },
  bamboo: { Svg: BambooLogo, color: CONNECTOR_BRAND_COLORS.bamboo, kind: TINT },
  sonarqube: { Svg: SonarqubeLogo, color: CONNECTOR_BRAND_COLORS.sonarqube, kind: TINT },
  codex: { kind: MONO },
  plane: { Svg: PlaneLogo, kind: LOGO },
  notion: { kind: MONO },
  opsgenie: { Svg: OpsgenieLogo, kind: MONO },
  cursor: { Svg: CursorLogo, kind: LOGO },
  'gh-copilot': { Svg: GhCopilotLogo, kind: MONO },
};

export const CONNECTOR_LOGO_KEYS = Object.keys(CONNECTOR_LOGOS);

export const getConnectorLogo = (plugin: string): ConnectorLogo | undefined => CONNECTOR_LOGOS[plugin];
