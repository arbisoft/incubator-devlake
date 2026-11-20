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

export type GithubConnectionValues = {
  endpoint?: string;
  authMethod?: string;
  proxy?: string;
  token?: string;
  appId?: string;
  secretKey?: string;
  installationId?: number;
};

export type GithubAppValues = Pick<GithubConnectionValues, 'appId' | 'secretKey' | 'installationId'>;

export type GitHubTransformationValues = {
  issueTypeRequirement?: string;
  issueTypeBug?: string;
  issueTypeIncident?: string;
  issuePriority?: string;
  issueComponent?: string;
  issueSeverity?: string;
  envNamePattern?: string;
  deploymentPattern?: string;
  productionPattern?: string;
  prType?: string;
  prComponent?: string;
  prBodyClosePattern?: string;
  refdiff?: {
    tagsLimit?: number;
    tagsPattern?: string;
  };
  prSizeExcludedFileExtensions?: string[];
};
