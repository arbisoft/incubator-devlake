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

export const COPY = {
  title: 'Personal Access Token(s)',
  description:
    'Add one or more personal token(s) for authentication from you and your organization members. Multiple tokens (from different GitHub accounts, NOT from one account) can help speed up the data collection process.',
  createTokenLink: 'Learn how to create a personal access token',
  tokenRequired: 'token is required',
  tokenPlaceholder: 'Token',
  invalidToken: 'Invalid',
  validFrom: (login: string | undefined) => `Valid From: ${login}`,
  permissionsHeading: 'Token Permissions',
  classicSuccess: 'All required fields are checked.',
  classicWarning:
    'This token is able to collect public repositories. If you want to collect private repositories, please check the field `repo`.',
  classicInvalidScopes: 'Please check the field(s) `repo:status`, `repo_deployment`, `read:user`, `read:org`.',
  classicPrivateRepositories: 'If you want to collect private repositories, please check the field `repo`.',
  fineGrainedSuccess:
    'Connection valid. Repository permissions have not been verified. Ensure the selected repositories have Read access to Actions, Contents, Discussions, Issues, Metadata and Pull requests.',
  fineGrainedAuthError: 'Authentication failed. Check that the token is valid and has not expired or been revoked.',
  tokenTestFailed: 'The token could not be tested. Check the connection and try again.',
  fineGrainedGuidance:
    'Select the intended resource owner and repositories. Grant Read access to Actions, Contents, Discussions, Issues, Metadata and Pull requests. Organizations may require approval. Read and write access also satisfies the Read requirement; Metadata is normally included automatically.',
  savedTokensLoadFailed: 'Could not load saved token results. Enter a token and test it again.',
  anotherToken: 'Another Token',
  removeToken: 'Remove token',
} as const;
