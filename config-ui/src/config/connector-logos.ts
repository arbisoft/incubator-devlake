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

import ArgocdLogoUrl from '@/images/connector-logos/argocd.svg?url';
import AwsLogo from '@/images/connector-logos/aws.svg?react';
import AzureLogoUrl from '@/images/connector-logos/azure.svg?url';
import BambooLogo from '@/images/connector-logos/bamboo.svg?react';
import BitbucketLogoUrl from '@/images/connector-logos/bitbucket.svg?url';
import CircleciLogo from '@/images/connector-logos/circleci.svg?react';
import ClaudeLogoUrl from '@/images/connector-logos/claude.svg?url';
import ClickupLogoUrl from '@/images/connector-logos/clickup.svg?url';
import CursorLogoUrl from '@/images/connector-logos/cursor.svg?url';
import GhCopilotLogo from '@/images/connector-logos/gh-copilot.svg?react';
import GithubLogo from '@/images/connector-logos/github.svg?react';
import GitlabLogoUrl from '@/images/connector-logos/gitlab.svg?url';
import GrafanaIrmLogoUrl from '@/images/connector-logos/grafana-irm.svg?url';
import IncidentioLogoUrl from '@/images/connector-logos/incidentio.svg?url';
import JenkinsLogoUrl from '@/images/connector-logos/jenkins.svg?url';
import JiraLogoUrl from '@/images/connector-logos/jira.svg?url';
import OpsgenieLogo from '@/images/connector-logos/opsgenie.svg?react';
import PagerdutyLogoUrl from '@/images/connector-logos/pagerduty.svg?url';
import PlaneLogoUrl from '@/images/connector-logos/plane.svg?url';
import SlackLogoUrl from '@/images/connector-logos/slack.svg?url';
import SonarqubeLogo from '@/images/connector-logos/sonarqube.svg?react';
import WebhookLogo from '@/images/connector-logos/webhook.svg?react';
import YoutrackLogoUrl from '@/images/connector-logos/youtrack.svg?url';
import { CONNECTOR_BRAND_COLORS } from '@/theme';
import { CONNECTOR_LOGO_KIND, type ConnectorLogo } from '@/ui/plugin-icon';

const { LOGO, MONO, TINT } = CONNECTOR_LOGO_KIND;

const CONNECTOR_LOGOS: Record<string, ConnectorLogo> = {
  github: { Svg: GithubLogo, kind: MONO },
  gitlab: { src: GitlabLogoUrl, kind: LOGO },
  bitbucket: { src: BitbucketLogoUrl, kind: LOGO },
  bitbucket_server: { src: BitbucketLogoUrl, kind: LOGO },
  azuredevops: { src: AzureLogoUrl, kind: LOGO },
  jira: { src: JiraLogoUrl, kind: LOGO },
  jenkins: { src: JenkinsLogoUrl, kind: LOGO },
  pagerduty: { src: PagerdutyLogoUrl, kind: LOGO },
  circleci: { Svg: CircleciLogo, kind: MONO },
  claude_code: { src: ClaudeLogoUrl, kind: LOGO },
  claude_otel: { src: ClaudeLogoUrl, kind: LOGO },
  webhook: { Svg: WebhookLogo, kind: MONO },
  argocd: { src: ArgocdLogoUrl, kind: LOGO },
  aws: { Svg: AwsLogo, kind: MONO },
  grafana_irm: { src: GrafanaIrmLogoUrl, kind: LOGO },
  youtrack: { src: YoutrackLogoUrl, kind: LOGO },
  clickup: { src: ClickupLogoUrl, kind: LOGO },
  slack: { src: SlackLogoUrl, kind: LOGO },
  azuredevops_go: { src: AzureLogoUrl, kind: LOGO },
  incidentio: { src: IncidentioLogoUrl, kind: LOGO },
  asana: { color: CONNECTOR_BRAND_COLORS.asana, kind: TINT },
  hubspot: { color: CONNECTOR_BRAND_COLORS.hubspot, kind: TINT },
  linear: { color: CONNECTOR_BRAND_COLORS.linear, kind: TINT },
  bamboo: { Svg: BambooLogo, color: CONNECTOR_BRAND_COLORS.bamboo, kind: TINT },
  sonarqube: { Svg: SonarqubeLogo, color: CONNECTOR_BRAND_COLORS.sonarqube, kind: TINT },
  codex: { kind: MONO },
  plane: { src: PlaneLogoUrl, kind: LOGO, invertInDark: true },
  notion: { kind: MONO },
  opsgenie: { Svg: OpsgenieLogo, kind: MONO },
  cursor: { src: CursorLogoUrl, kind: LOGO, invertInDark: true },
  'gh-copilot': { Svg: GhCopilotLogo, kind: MONO },
};

export const CONNECTOR_LOGO_KEYS = Object.keys(CONNECTOR_LOGOS);

export const getConnectorLogo = (plugin: string): ConnectorLogo | undefined => CONNECTOR_LOGOS[plugin];
