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

import type { ReactNode } from 'react';

import { ArgoCDTransformation } from '@/plugins/register/argocd';
import { AsanaTransformation } from '@/plugins/register/asana';
import { AzureTransformation } from '@/plugins/register/azure';
import { BambooTransformation } from '@/plugins/register/bamboo';
import { BitbucketTransformation } from '@/plugins/register/bitbucket';
import { BitbucketServerTransformation } from '@/plugins/register/bitbucket-server';
import { CircleCITransformation } from '@/plugins/register/circleci';
import { ClickUpTransformation } from '@/plugins/register/clickup';
import { GhCopilotTransformation } from '@/plugins/register/gh-copilot';
import { GitHubTransformation } from '@/plugins/register/github';
import { GitLabTransformation } from '@/plugins/register/gitlab';
import { JenkinsTransformation } from '@/plugins/register/jenkins';
import { JiraTransformation } from '@/plugins/register/jira';
import { SalesforceTransformation } from '@/plugins/register/salesforce';
import { TapdTransformation } from '@/plugins/register/tapd';
import type { TapdTransformationValues } from '@/plugins/register/tapd/types';
import { YoutrackTransformation } from '@/plugins/register/youtrack';

import type { TransformationComponent, TransformationProps } from './types';

const TapdRenderer = ({ scopeId, ...props }: TransformationProps<TapdTransformationValues>) =>
  scopeId ? <TapdTransformation {...props} scopeId={scopeId} /> : null;

// resolved at call time: the plugin modules are still mid-evaluation when this module loads (import cycle)
const getRenderers = (): Record<string, TransformationComponent> => ({
  argocd: ArgoCDTransformation,
  clickup: ClickUpTransformation,
  azuredevops: AzureTransformation,
  azuredevops_go: AzureTransformation,
  bamboo: BambooTransformation,
  bitbucket: BitbucketTransformation,
  bitbucket_server: BitbucketServerTransformation,
  circleci: CircleCITransformation,
  github: GitHubTransformation,
  'gh-copilot': GhCopilotTransformation,
  salesforce: SalesforceTransformation,
  gitlab: GitLabTransformation,
  jenkins: JenkinsTransformation,
  jira: JiraTransformation,
  asana: AsanaTransformation,
  tapd: TapdRenderer,
  youtrack: YoutrackTransformation,
});

export const renderTransformation = (plugin: string, props: TransformationProps): ReactNode => {
  const Component = getRenderers()[plugin];
  return Component ? <Component {...props} /> : null;
};
