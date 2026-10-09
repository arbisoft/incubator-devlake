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

type Options = Record<string, unknown>;

const text = (options: Options, key: string) => {
  const value = options[key];
  return value === undefined || value === null ? undefined : String(value);
};

const byKey =
  (key: string) =>
  (options: Options): string | undefined =>
    text(options, key);

const ZENTAO_PROJECT = 'projectId';
const ZENTAO_PRODUCT = 'productId';

// The part after "name:" that identifies what a task collects, per plugin.
const SCOPE_LABEL: Record<string, (options: Options) => string | undefined> = {
  github: byKey('name'),
  github_graphql: byKey('name'),
  gitextractor: byKey('name'),
  dora: byKey('projectName'),
  gitlab: byKey('projectId'),
  bitbucket: byKey('fullName'),
  tapd: byKey('workspaceId'),
  jira: byKey('boardId'),
  jenkins: byKey('fullName'),
  sonarqube: byKey('projectKey'),
  zentao: (options) =>
    options[ZENTAO_PROJECT] ? `project/${text(options, ZENTAO_PROJECT)}` : `product/${text(options, ZENTAO_PRODUCT)}`,
  refdiff: (options) => text(options, 'repoId') ?? text(options, 'projectName'),
  bamboo: byKey('planKey'),
  argocd: byKey('ApplicationName'),
};

const AZURE_DEVOPS_GO = 'azuredevops_go';
const AZURE_DEVOPS_GO_PREFIX = 'ado';

export const getTaskName = (plugin: string, baseName: string, options: Options = {}) => {
  if (plugin === AZURE_DEVOPS_GO) {
    const name = text(options, 'name');
    return name === undefined ? baseName : `${AZURE_DEVOPS_GO_PREFIX}:${name}`;
  }
  const label = SCOPE_LABEL[plugin]?.(options);
  return label === undefined ? baseName : `${baseName}:${label}`;
};
