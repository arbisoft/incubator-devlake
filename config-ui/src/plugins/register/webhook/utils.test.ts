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

import type { IWebhook } from '@/types';

import { API_KEY_PLACEHOLDER } from './constants';
import { buildCommands, getApiPrefix } from './utils';

const WEBHOOK = {
  id: 7,
  name: 'ci',
  postIssuesEndpoint: '/rest/plugins/webhook/connections/7/issues',
  closeIssuesEndpoint: '/rest/plugins/webhook/connections/7/issue/:issueKey/close',
  postPipelineDeployTaskEndpoint: '/rest/plugins/webhook/connections/7/deployments',
  postPullRequestsEndpoint: '/rest/plugins/webhook/connections/7/pull_requests',
} as IWebhook;

const PREFIX = 'https://devlake.example.com/api';

describe('getApiPrefix', () => {
  it('puts the API path after the origin', () => {
    expect(getApiPrefix('https://devlake.example.com')).toBe(PREFIX);
  });
});

describe('buildCommands', () => {
  it('builds a POST for each endpoint of the webhook', () => {
    const commands = buildCommands(PREFIX, WEBHOOK, 'secret-key');

    expect(commands.postIssuesEndpoint).toMatch(
      /^curl https:\/\/devlake\.example\.com\/api\/rest\/plugins\/webhook\/connections\/7\/issues -X 'POST' -H 'Authorization: Bearer secret-key' -d '\{/,
    );
    expect(commands.closeIssuesEndpoint).toBe(
      `curl ${PREFIX}${WEBHOOK.closeIssuesEndpoint} -X 'POST' -H 'Authorization: Bearer secret-key'`,
    );
    expect(commands.postDeploymentsCurl).toContain(`${PREFIX}${WEBHOOK.postPipelineDeployTaskEndpoint} -X 'POST'`);
    expect(commands.postPullRequestsEndpoint).toContain(`${PREFIX}${WEBHOOK.postPullRequestsEndpoint} -X 'POST'`);
  });

  it('closes the quote of every JSON body', () => {
    const { postIssuesEndpoint, postDeploymentsCurl, postPullRequestsEndpoint } = buildCommands(PREFIX, WEBHOOK, 'k');

    [postIssuesEndpoint, postDeploymentsCurl, postPullRequestsEndpoint].forEach((command) => {
      expect(command.endsWith("}'")).toBe(true);
    });
  });

  it('sends valid JSON bodies', () => {
    const { postIssuesEndpoint, postDeploymentsCurl, postPullRequestsEndpoint } = buildCommands(PREFIX, WEBHOOK, 'k');

    [postIssuesEndpoint, postDeploymentsCurl, postPullRequestsEndpoint].forEach((command) => {
      const body = command.slice(command.indexOf("-d '") + 4, -1);
      expect(() => JSON.parse(body)).not.toThrow();
    });
  });

  it('leaves the key placeholder in place until a key is known', () => {
    expect(buildCommands(PREFIX, WEBHOOK, '').closeIssuesEndpoint).toContain(`Bearer ${API_KEY_PLACEHOLDER}'`);
    expect(buildCommands(PREFIX, WEBHOOK).closeIssuesEndpoint).toContain(`Bearer ${API_KEY_PLACEHOLDER}'`);
  });
});
