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
import { YoutrackTransformation } from '@/plugins/register/youtrack';

import type { TransformationProps } from './types';

const base = ({ entities, transformation, setTransformation }: TransformationProps) => ({
  entities,
  transformation,
  setTransformation,
});

const azure = (props: TransformationProps) => <AzureTransformation {...base(props)} />;

const RENDERERS: Record<string, (props: TransformationProps) => ReactNode> = {
  argocd: (props) => <ArgoCDTransformation {...base(props)} />,
  clickup: (props) => <ClickUpTransformation {...base(props)} connectionId={props.connectionId} />,
  azuredevops: azure,
  azuredevops_go: azure,
  bamboo: (props) => <BambooTransformation {...base(props)} />,
  bitbucket: (props) => <BitbucketTransformation {...base(props)} />,
  bitbucket_server: (props) => <BitbucketServerTransformation {...base(props)} />,
  circleci: (props) => <CircleCITransformation {...base(props)} />,
  github: (props) => <GitHubTransformation {...base(props)} setHasError={props.setHasError} />,
  'gh-copilot': (props) => <GhCopilotTransformation {...base(props)} />,
  salesforce: (props) => <SalesforceTransformation {...base(props)} />,
  gitlab: (props) => <GitLabTransformation {...base(props)} setHasError={props.setHasError} />,
  jenkins: (props) => <JenkinsTransformation {...base(props)} />,
  jira: (props) => <JiraTransformation {...base(props)} connectionId={props.connectionId} />,
  asana: (props) => <AsanaTransformation {...base(props)} connectionId={props.connectionId} />,
  tapd: (props) =>
    props.scopeId ? (
      <TapdTransformation {...base(props)} connectionId={props.connectionId} scopeId={props.scopeId} />
    ) : null,
  youtrack: (props) => (
    <YoutrackTransformation {...base(props)} connectionId={props.connectionId} scopeConfigId={props.scopeConfigId} />
  ),
};

export const renderTransformation = (plugin: string, props: TransformationProps): ReactNode =>
  RENDERERS[plugin]?.(props) ?? null;
